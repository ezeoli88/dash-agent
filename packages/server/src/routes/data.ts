import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { SqlValue } from 'sql.js';
import { getDatabase, withTransaction } from '../db/database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('routes:data');
const router = Router();

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

  const db = getDatabase();
  let inserted = 0;

  for (const row of rows) {
    const columns = Object.keys(row);
    const values = Object.values(row).map(toSqlValue);
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
router.get('/export', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('GET /data/export');

    const exportData: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: getAllFromTable('tasks'),
      task_logs: getAllFromTable('task_logs'),
      repositories: getAllFromTable('repositories'),
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
router.post('/import', (req: Request, res: Response, next: NextFunction): void => {
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

    const imported = withTransaction(() => {
      // Clear existing data if not merging
      if (!merge) {
        clearTable('task_logs'); // Clear first due to foreign key
        clearTable('tasks');
        clearTable('repositories');
      }

      // Import data
      const repositoriesInserted = insertIntoTable('repositories', importData.repositories);
      const tasksInserted = insertIntoTable('tasks', importData.tasks);
      const taskLogsInserted = insertIntoTable('task_logs', importData.task_logs);

      return {
        tasks: tasksInserted,
        task_logs: taskLogsInserted,
        repositories: repositoriesInserted,
      };
    });

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
router.delete('/', (req: Request, res: Response, next: NextFunction): void => {
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
    const countRepositories = db.exec('SELECT COUNT(*) FROM repositories')[0]?.values[0]?.[0] as number || 0;

    withTransaction(() => {
      // Clear all data (order matters due to foreign keys)
      clearTable('task_logs');
      clearTable('tasks');
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
