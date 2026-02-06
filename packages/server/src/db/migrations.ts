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
    {
      version: 3,
      description: 'Create repositories table',
      sql: `
        CREATE TABLE IF NOT EXISTS repositories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          url TEXT NOT NULL UNIQUE,
          default_branch TEXT DEFAULT 'main',
          detected_stack TEXT,
          conventions TEXT,
          learned_patterns TEXT DEFAULT '[]',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_repositories_name ON repositories(name);
        CREATE INDEX IF NOT EXISTS idx_repositories_url ON repositories(url);
      `,
    },
    {
      version: 4,
      description: 'Add two-agent workflow columns to tasks table',
      sql: `
        -- Add new columns for the two-agent workflow
        ALTER TABLE tasks ADD COLUMN repository_id TEXT;
        ALTER TABLE tasks ADD COLUMN user_input TEXT;
        ALTER TABLE tasks ADD COLUMN generated_spec TEXT;
        ALTER TABLE tasks ADD COLUMN generated_spec_at TEXT;
        ALTER TABLE tasks ADD COLUMN final_spec TEXT;
        ALTER TABLE tasks ADD COLUMN spec_approved_at TEXT;
        ALTER TABLE tasks ADD COLUMN was_spec_edited INTEGER DEFAULT 0;
        ALTER TABLE tasks ADD COLUMN branch_name TEXT;
        ALTER TABLE tasks ADD COLUMN pr_number INTEGER;

        -- Create index for repository_id lookups
        CREATE INDEX IF NOT EXISTS idx_tasks_repository_id ON tasks(repository_id);
      `,
    },
    {
      version: 5,
      description: 'Create user_secrets table for encrypted API keys and tokens',
      sql: `
        -- Table for storing encrypted secrets (API keys, tokens)
        CREATE TABLE IF NOT EXISTS user_secrets (
          id TEXT PRIMARY KEY,
          key_type TEXT NOT NULL,
          provider TEXT,
          encrypted_value TEXT NOT NULL,
          metadata TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Ensure unique combination of key_type and provider
        CREATE UNIQUE INDEX IF NOT EXISTS idx_user_secrets_key_provider ON user_secrets(key_type, provider);

        -- Index for quick lookups by key_type
        CREATE INDEX IF NOT EXISTS idx_user_secrets_key_type ON user_secrets(key_type);
      `,
    },
    {
      version: 6,
      description: 'Create user_settings table for application configuration',
      sql: `
        CREATE TABLE IF NOT EXISTS user_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `,
    },
    {
      version: 7,
      description: 'Add agent_type and agent_model columns to tasks table',
      sql: `
        ALTER TABLE tasks ADD COLUMN agent_type TEXT;
        ALTER TABLE tasks ADD COLUMN agent_model TEXT;
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
