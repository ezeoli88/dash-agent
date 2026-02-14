import { createServer } from 'net';
import { resolve, join, dirname } from 'path';
import { existsSync } from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { getConfig } from './config.js';
import { runMigrations } from './db/migrations.js';
import { initDatabase, closeDatabase } from './db/database.js';
import { logger } from './utils/logger.js';
import tasksRouter from './routes/tasks.js';
import setupRouter from './routes/setup.js';
import reposRouter from './routes/repos.js';
import dataRouter from './routes/data.js';
import secretsRouter from './routes/secrets.js';
import { getPRCommentsService } from './services/pr-comments.service.js';
import { generateStartupToken } from './services/auth.service.js';
import { setAuthToken, requireAuth } from './middleware/auth.middleware.js';

/**
 * Timeout for graceful shutdown before forcing exit (in milliseconds).
 */
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Error response structure.
 */
interface ErrorResponse {
  error: string;
  message?: string;
  stack?: string;
}

/**
 * Checks if an origin is allowed for CORS.
 * Allows localhost, loopback, and RFC 1918 private IPs.
 */
function isAllowedOrigin(origin: string): boolean {
  const url = new URL(origin);
  const hostname = url.hostname;
  // Allow localhost, 127.0.0.1, [::1]
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return true;
  // Allow RFC 1918 private IPs: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every(p => !isNaN(p))) {
    const [a, b] = parts as [number, number, number, number];
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

/**
 * Creates and configures the Express application.
 */
function createApp(authToken?: string, startupId?: string): express.Application {
  const app = express();

  // CORS: restrict to localhost and private network origins
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header (same-origin, curl, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }
      try {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked: ${origin}`));
        }
      } catch {
        callback(new Error(`CORS blocked: invalid origin`));
      }
    },
    credentials: true,
  }));

  // API response headers — prevent browser caching and expose server startup ID
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (startupId) {
      res.setHeader('X-Server-ID', startupId);
    }
    next();
  });

  // Parse JSON request bodies
  app.use(express.json());

  // Request logging middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      query: req.query,
    });
    next();
  });

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // Auth middleware — protects all /api routes except health
  if (authToken) {
    app.use('/api', requireAuth);
  }

  // Mount routes
  app.use('/api/tasks', tasksRouter);
  app.use('/api/setup', setupRouter);
  app.use('/api/repos', reposRouter);
  app.use('/api/data', dataRouter);
  app.use('/api/secrets', secretsRouter);

  // Serve frontend static files (for production/binary mode)
  const isBinaryMode = process.env['__BIN_MODE__'] === '1';
  const baseDir = isBinaryMode ? dirname(process.execPath) : process.cwd();
  const staticDir = resolve(baseDir, 'public');
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));

    // SPA fallback - any non-API route serves index.html
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/')) {
        return next(); // Let API 404 handler deal with it
      }
      const indexPath = join(staticDir, 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  }

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource does not exist',
    });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.errorWithStack('Unhandled error', err);

    const response: ErrorResponse = {
      error: 'Internal Server Error',
      message: err.message,
    };

    // Include stack trace in development
    if (process.env['NODE_ENV'] !== 'production' && err.stack !== undefined) {
      response.stack = err.stack;
    }

    res.status(500).json(response);
  });

  return app;
}

/**
 * Checks if a port is available by attempting to create a server on it.
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

/**
 * Finds an available port starting from the given port.
 * Tries up to maxAttempts consecutive ports.
 */
async function findAvailablePort(startPort: number, maxAttempts = 10): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
    logger.info(`Port ${port} is in use, trying next...`);
  }
  throw new Error(`No available port found in range ${startPort}-${startPort + maxAttempts - 1}`);
}

/**
 * Starts the HTTP server.
 */
export async function main(): Promise<{ port: number; token: string }> {
  logger.info('Starting Agent Board API');

  // Load configuration
  const config = getConfig();
  logger.info('Configuration loaded', {
    port: config.port,
    databasePath: config.databasePath,
    reposBaseDir: config.reposBaseDir,
    worktreesDir: config.worktreesDir,
    logLevel: config.logLevel,
  });

  // Initialize database and run migrations
  await initDatabase();
  runMigrations();

  // Auth: enabled by default in binary mode, disabled in dev mode.
  // Override with AUTH_ENABLED=1 (dev) or AUTH_DISABLED=1 (binary).
  const isBinaryMode = process.env['__BIN_MODE__'] === '1';

  // Log scan path configuration for debugging
  logger.info('Repo scan configuration', {
    AGENT_BOARD_USER_DIR: process.env['AGENT_BOARD_USER_DIR'] ?? '(not set)',
    LOCAL_SCAN_DIR: process.env['LOCAL_SCAN_DIR'] ?? '(not set)',
    cwd: process.cwd(),
    isBinaryMode,
  });

  const authEnabled = isBinaryMode
    ? process.env['AUTH_DISABLED'] !== '1'
    : process.env['AUTH_ENABLED'] === '1';
  const authToken = authEnabled ? generateStartupToken() : undefined;

  if (authToken) {
    setAuthToken(authToken);
    logger.info('Authentication enabled');
  } else {
    logger.info('Authentication disabled (dev mode)');
  }

  // Create and start Express app
  const startupId = crypto.randomUUID();
  const app = createApp(authToken, startupId);

  const actualPort = await findAvailablePort(config.port);
  if (actualPort !== config.port) {
    logger.info(`Default port ${config.port} was in use, using port ${actualPort} instead`);
  }

  // Listen on 0.0.0.0 so the server is accessible from LAN (not just localhost)
  const server = app.listen(actualPort, '0.0.0.0', () => {
    logger.info(`Server listening on 0.0.0.0:${actualPort}`);
    logger.info(`Health check: http://localhost:${actualPort}/api/health`);
    logger.info(`Tasks API: http://localhost:${actualPort}/api/tasks`);
    logger.info(`Repos API: http://localhost:${actualPort}/api/repos`);
  });

  // Start PR comments polling service
  const prCommentsService = getPRCommentsService();
  prCommentsService.start();

  // Graceful shutdown handlers
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);

    // Stop PR comments polling
    prCommentsService.stop();

    server.close(() => {
      logger.info('HTTP server closed');
      closeDatabase();
      logger.info('Database connection closed');
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { port: actualPort, token: authToken || '' };
}

// Start the application (unless imported by bin.ts)
if (!process.env['__BIN_MODE__']) {
  main().then(({ port, token }) => {
    if (token) {
      logger.info(`Auth token: ${token}`);
      logger.info(`Open: http://localhost:${port}?token=${token}`);
    }
  }).catch((error: Error) => {
    logger.errorWithStack('Failed to start application', error);
    process.exit(1);
  });
}
