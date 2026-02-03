import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { getConfig } from './config.js';
import { runMigrations } from './db/migrations.js';
import { initDatabase, closeDatabase } from './db/database.js';
import { logger } from './utils/logger.js';
import tasksRouter from './routes/tasks.js';

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

  // Mount task routes
  app.use('/tasks', tasksRouter);

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

  const server = app.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`);
    logger.info(`Health check: http://localhost:${config.port}/health`);
    logger.info(`Tasks API: http://localhost:${config.port}/tasks`);
  });

  // Graceful shutdown handlers
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
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
