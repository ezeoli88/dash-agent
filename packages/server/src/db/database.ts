import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { getConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('database');

/** Singleton database instance */
let db: SqlJsDatabase | null = null;
let dbPath: string = '';

/**
 * Initializes the SQL.js database.
 * This must be called before getDatabase().
 */
export async function initDatabase(): Promise<SqlJsDatabase> {
  if (db !== null) {
    return db;
  }

  const config = getConfig();
  dbPath = config.databasePath;

  // Ensure parent directory exists
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    logger.info('Creating database directory', { path: dbDir });
    mkdirSync(dbDir, { recursive: true });
  }

  logger.info('Initializing SQL.js database', { path: dbPath });

  // Initialize SQL.js
  const isBinaryMode = process.env['__BIN_MODE__'] === '1';
  const SQL = await initSqlJs(
    isBinaryMode
      ? { locateFile: (file: string) => join(dirname(process.execPath), file) }
      : undefined
  );

  // Load existing database or create new one
  if (existsSync(dbPath)) {
    logger.info('Loading existing database');
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    logger.info('Creating new database');
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  logger.info('Database initialized successfully');
  return db;
}

/**
 * Gets the SQLite database instance.
 * Throws an error if the database has not been initialized.
 */
export function getDatabase(): SqlJsDatabase {
  if (db === null) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Saves the database to disk.
 */
export function saveDatabase(): void {
  if (db !== null && dbPath !== '') {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(dbPath, buffer);
    logger.debug('Database saved to disk');
  }
}

/**
 * Closes the database connection and saves to disk.
 */
export function closeDatabase(): void {
  if (db !== null) {
    logger.info('Closing database connection');
    saveDatabase();
    db.close();
    db = null;
  }
}

/**
 * Executes a function within a transaction.
 * Rolls back on error, commits on success.
 */
export function withTransaction<T>(fn: () => T): T {
  const database = getDatabase();
  database.run('BEGIN TRANSACTION');
  try {
    const result = fn();
    database.run('COMMIT');
    saveDatabase();
    return result;
  } catch (error) {
    database.run('ROLLBACK');
    throw error;
  }
}

export default getDatabase;
