import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { SqlValue } from 'sql.js';
import { getDatabase, withTransaction } from '../db/database.js';
import { createLogger } from '../utils/logger.js';
import { getRepoService } from '../services/repo.service.js';

const logger = createLogger('routes:data');
const router = Router();

// =============================================================================
// SQL Injection Protection - Column & Table Whitelists
// =============================================================================

const TABLE_COLUMN_WHITELIST: Record<string, ReadonlySet<string>> = {
  tasks: new Set(['id', 'title', 'description', 'repo_url', 'target_branch', 'context_files', 'build_command', 'status', 'pr_url', 'error', 'created_at', 'updated_at', 'repository_id', 'user_input', 'generated_spec', 'generated_spec_at', 'final_spec', 'spec_approved_at', 'was_spec_edited', 'branch_name', 'pr_number', 'agent_type', 'agent_model', 'changes_data', 'conflict_files']),
  task_logs: new Set(['id', 'task_id', 'timestamp', 'level', 'message']),
  repositories: new Set(['id', 'name', 'url', 'default_branch', 'detected_stack', 'conventions', 'learned_patterns', 'created_at', 'updated_at']),
};
const VALID_TABLE_NAMES = new Set(Object.keys(TABLE_COLUMN_WHITELIST));

// =============================================================================
// Types & Schemas
// =============================================================================

/**
 * Schema for validating import data structure.
 */
const ImportDataSchema = z.object({
  version: z.number().optional().default(1),
  exportedAt: z.string().optional(),
  tasks: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  task_logs: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  repositories: z.array(z.record(z.string(), z.unknown())).optional().default([]),
});

type ImportData = z.infer<typeof ImportDataSchema>;

/**
 * Export data structure
 */
interface ExportData {
  version: number;
  exportedAt: string;
  tasks: Record<string, unknown>[];
  task_logs: Record<string, unknown>[];
  repositories: Record<string, unknown>[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets all rows from a table as an array of objects.
 */
function getAllFromTable(tableName: string): Record<string, unknown>[] {
  if (!VALID_TABLE_NAMES.has(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  const db = getDatabase();
  const result = db.exec(`SELECT * FROM ${tableName}`);

  if (!result[0]) {
    return [];
  }

  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

/**
 * Clears all data from a table.
 */
function clearTable(tableName: string): void {
  if (!VALID_TABLE_NAMES.has(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  const db = getDatabase();
  db.run(`DELETE FROM ${tableName}`);
  logger.info(`Cleared table: ${tableName}`);
}

/**
 * Converts unknown values to SqlValue format.
 */
function toSqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  // For objects/arrays, stringify them
  return JSON.stringify(value);
}

/**
 * Inserts data into a table.
 */
function insertIntoTable(tableName: string, rows: Record<string, unknown>[]): number {
  if (rows.length === 0) return 0;
  if (!VALID_TABLE_NAMES.has(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  const allowedColumns = TABLE_COLUMN_WHITELIST[tableName];
  const db = getDatabase();
  let inserted = 0;

  for (const row of rows) {
    const columns = Object.keys(row).filter(col => {
      if (!allowedColumns!.has(col)) {
        logger.warn(`Skipping invalid column "${col}" for table "${tableName}"`);
        return false;
      }
      return true;
    });

    if (columns.length === 0) continue;

    const values = columns.map(col => toSqlValue(row[col]));
    const placeholders = columns.map(() => '?').join(', ');

    try {
      db.run(
        `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      );
      inserted++;
    } catch (error) {
      logger.warn(`Failed to insert row into ${tableName}`, { error, row });
    }
  }

  return inserted;
}

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /data/export - Export all data as JSON
 *
 * Response: ExportData
 */
router.get('/export', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info('GET /data/export');

    // Repositories are in-memory, so export them from the service
    const repoService = getRepoService();
    const inMemoryRepos = await repoService.getRepositories();

    const exportData: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: getAllFromTable('tasks'),
      task_logs: getAllFromTable('task_logs'),
      repositories: inMemoryRepos as unknown as Record<string, unknown>[],
    };

    logger.info('Export completed', {
      tasks: exportData.tasks.length,
      task_logs: exportData.task_logs.length,
      repositories: exportData.repositories.length,
    });

    res.json(exportData);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /data/import - Import data from JSON
 *
 * Request body: ImportData
 *
 * Options (query params):
 * - merge: boolean (default: false) - If true, merge with existing data instead of replacing
 *
 * Response:
 * - success: boolean
 * - imported: { tasks: number, task_logs: number, repositories: number }
 */
router.post('/import', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info('POST /data/import');

    // Validate request body
    const result = ImportDataSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const importData: ImportData = result.data;
    const merge = req.query.merge === 'true';

    // Handle in-memory repos: clear existing if not merging, then import
    const repoService = getRepoService();

    if (!merge) {
      const existingRepos = await repoService.getRepositories();
      for (const repo of existingRepos) {
        await repoService.deleteRepository(repo.id);
      }
    }

    // Import repositories into memory
    let repositoriesInserted = 0;
    for (const repoData of importData.repositories) {
      try {
        const name = (repoData.name as string) || '';
        const url = (repoData.url as string) || '';
        const defaultBranch = (repoData.default_branch as string) || 'main';

        // Skip if URL already exists (when merging)
        const existing = await repoService.getRepositoryByUrl(url);
        if (existing) continue;

        await repoService.createRepository({
          name,
          url,
          default_branch: defaultBranch,
        });
        repositoriesInserted++;
      } catch (error) {
        logger.warn('Failed to import repository into memory', { error, repoData });
      }
    }

    // Import tasks and task_logs into DB
    const dbImported = withTransaction(() => {
      if (!merge) {
        clearTable('task_logs');
        clearTable('tasks');
      }

      const tasksInserted = insertIntoTable('tasks', importData.tasks);
      const taskLogsInserted = insertIntoTable('task_logs', importData.task_logs);

      return {
        tasks: tasksInserted,
        task_logs: taskLogsInserted,
      };
    });

    const imported = {
      ...dbImported,
      repositories: repositoriesInserted,
    };

    logger.info('Import completed', imported);

    res.json({
      success: true,
      imported,
      merged: merge,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /data - Clear all data
 *
 * Request body:
 * - confirmation: string (must be "DELETE" to confirm)
 *
 * Response:
 * - success: boolean
 * - deleted: { tasks: number, task_logs: number, repositories: number }
 */
router.delete('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info('DELETE /data');

    // Require confirmation
    const { confirmation } = req.body;
    if (confirmation !== 'DELETE') {
      res.status(400).json({
        error: 'Confirmation required',
        message: 'Send { "confirmation": "DELETE" } to confirm deletion of all data',
      });
      return;
    }

    const db = getDatabase();

    // Get counts before deletion
    const countTasks = db.exec('SELECT COUNT(*) FROM tasks')[0]?.values[0]?.[0] as number || 0;
    const countTaskLogs = db.exec('SELECT COUNT(*) FROM task_logs')[0]?.values[0]?.[0] as number || 0;

    // Repositories are in-memory; count them from the service
    const repoService = getRepoService();
    const inMemoryRepos = await repoService.getRepositories();
    const countRepositories = inMemoryRepos.length;

    // Delete each in-memory repo
    for (const repo of inMemoryRepos) {
      await repoService.deleteRepository(repo.id);
    }

    withTransaction(() => {
      // Clear DB-persisted data (order matters due to foreign keys)
      clearTable('task_logs');
      clearTable('tasks');
      // Also clear stale rows from the repositories DB table
      clearTable('repositories');
    });

    logger.info('All data deleted', {
      tasks: countTasks,
      task_logs: countTaskLogs,
      repositories: countRepositories,
    });

    res.json({
      success: true,
      deleted: {
        tasks: countTasks,
        task_logs: countTaskLogs,
        repositories: countRepositories,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
