import { createServer } from 'net';
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
 * Creates and configures the Express application.
 */
function createApp(): express.Application {
  const app = express();

  // Enable CORS for all origins
  app.use(cors({
    origin: true,
    credentials: true,
  }));

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
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount routes
  app.use('/tasks', tasksRouter);
  app.use('/setup', setupRouter);
  app.use('/repos', reposRouter);
  app.use('/data', dataRouter);
  app.use('/secrets', secretsRouter);

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
async function main(): Promise<void> {
  logger.info('Starting Agent Board API');

  // Load configuration
  const config = getConfig();
  logger.info('Configuration loaded', {
    port: config.port,
    databasePath: config.databasePath,
    logLevel: config.logLevel,
  });

  // Initialize database and run migrations
  await initDatabase();
  runMigrations();

  // Create and start Express app
  const app = createApp();

  const actualPort = await findAvailablePort(config.port);
  if (actualPort !== config.port) {
    logger.info(`Default port ${config.port} was in use, using port ${actualPort} instead`);
  }

  const server = app.listen(actualPort, () => {
    logger.info(`Server listening on port ${actualPort}`);
    logger.info(`Health check: http://localhost:${actualPort}/health`);
    logger.info(`Tasks API: http://localhost:${actualPort}/tasks`);
    logger.info(`Repos API: http://localhost:${actualPort}/repos`);
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
}

// Start the application
main().catch((error: Error) => {
  logger.errorWithStack('Failed to start application', error);
  process.exit(1);
});
