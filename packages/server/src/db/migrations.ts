import type { Database as SqlJsDatabase } from 'sql.js';
import { getDatabase, saveDatabase } from './database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('migrations');

/**
 * Gets the current schema version from the database.
 */
function getCurrentSchemaVersion(db: SqlJsDatabase): number {
  const result = db.exec('SELECT version FROM schema_versions ORDER BY version DESC LIMIT 1');
  const firstResult = result[0];
  const firstRow = firstResult?.values[0];
  return (firstRow?.[0] as number | undefined) ?? 0;
}

/**
 * Runs all pending database migrations.
 * Uses a schema_versions table to track which migrations have been applied.
 */
export function runMigrations(): void {
  const db = getDatabase();
  logger.info('Running database migrations');

  // Create schema_versions table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get current schema version
  const currentVersion = getCurrentSchemaVersion(db);
  logger.info('Current schema version', { version: currentVersion });

  // Define migrations
  const migrations: Array<{ version: number; description: string; sql: string }> = [
    {
      version: 1,
      description: 'Create tasks table',
      sql: `
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          repo_url TEXT NOT NULL,
          target_branch TEXT DEFAULT 'main',
          context_files TEXT DEFAULT '[]',
          build_command TEXT,

          status TEXT DEFAULT 'backlog',
          pr_url TEXT,
          error TEXT,

          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
      `,
    },
    {
      version: 2,
      description: 'Create task_logs table',
      sql: `
        CREATE TABLE IF NOT EXISTS task_logs (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
          level TEXT DEFAULT 'info',
          message TEXT NOT NULL,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_logs_timestamp ON task_logs(timestamp);
      `,
    },
  ];

  // Apply pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      logger.info('Applying migration', {
        version: migration.version,
        description: migration.description,
      });

      try {
        db.run('BEGIN TRANSACTION');
        db.run(migration.sql);
        db.run('INSERT INTO schema_versions (version) VALUES (?)', [migration.version]);
        db.run('COMMIT');
        logger.info('Migration applied successfully', { version: migration.version });
      } catch (error) {
        db.run('ROLLBACK');
        throw error;
      }
    }
  }

  // Save changes to disk
  saveDatabase();

  const finalVersion = getCurrentSchemaVersion(db);
  logger.info('Database migrations complete', { version: finalVersion });
}

export default runMigrations;
