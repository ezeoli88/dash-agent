import { getConfig } from '../config.js';

/**
 * Log levels in order of severity
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Structured log entry
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
}

/**
 * Simple logger utility with structured JSON output.
 * Respects the LOG_LEVEL environment variable.
 */
class Logger {
  private context: string;
  private minLevel: number;

  constructor(context: string = 'app') {
    this.context = context;
    try {
      const config = getConfig();
      this.minLevel = LOG_LEVELS[config.logLevel];
    } catch {
      // Default to info if config not loaded yet
      this.minLevel = LOG_LEVELS.info;
    }
  }

  /**
   * Creates a new logger instance with a specific context.
   */
  child(context: string): Logger {
    return new Logger(`${this.context}:${context}`);
  }

  /**
   * Formats and outputs a log entry.
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < this.minLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
    };

    if (data !== undefined && Object.keys(data).length > 0) {
      entry.data = data;
    }

    const output = JSON.stringify(entry);

    switch (level) {
      case 'debug':
      case 'info':
        console.log(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  }

  /**
   * Logs a debug message.
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Logs an info message.
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Logs a warning message.
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Logs an error message.
   */
  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  /**
   * Logs an error with stack trace.
   */
  errorWithStack(message: string, error: Error, data?: Record<string, unknown>): void {
    this.log('error', message, {
      ...data,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });
  }
}

/** Default application logger */
export const logger = new Logger('agent-board');

/**
 * Creates a logger with a specific context.
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}

export default logger;
