import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from '../db/database.js';
import { createLogger } from '../utils/logger.js';
import type { CreateTaskInput, UpdateTaskInput, TaskStatus } from '../schemas/task.schema.js';

const logger = createLogger('task-service');

/**
 * Task entity representing a development task for the AI agent.
 */
export interface Task {
  /** Unique identifier (UUID) */
  id: string;
  /** Short feature name */
  title: string;
  /** Detailed description (prompt for agent) */
  description: string;
  /** Repository URL (e.g., https://github.com/user/repo) */
  repo_url: string;
  /** Base branch for the task (default: "main") */
  target_branch: string;
  /** Optional: files the agent should review first */
  context_files: string[];
  /** Optional: build command to verify changes */
  build_command: string | null;

  /** Current status of the task */
  status: TaskStatus;
  /** URL of the created PR (when status is 'done') */
  pr_url: string | null;
  /** Error message if the task failed */
  error: string | null;

  /** ISO timestamp when the task was created */
  created_at: string;
  /** ISO timestamp when the task was last updated */
  updated_at: string;
}

export type { CreateTaskInput, UpdateTaskInput, TaskStatus };

/**
 * Column names for the tasks table, in order.
 */
const TASK_COLUMNS = [
  'id',
  'title',
  'description',
  'repo_url',
  'target_branch',
  'context_files',
  'build_command',
  'status',
  'pr_url',
  'error',
  'created_at',
  'updated_at',
] as const;

/**
 * Allowed columns for UPDATE operations (whitelist to prevent SQL injection).
 */
const ALLOWED_UPDATE_COLUMNS = new Set([
  'title',
  'description',
  'repo_url',
  'target_branch',
  'context_files',
  'build_command',
  'status',
  'pr_url',
  'error',
]);

/**
 * Safely parses a JSON array string, returning empty array on failure.
 */
function safeParseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Converts a sql.js result row (array) to a Task object.
 */
function rowToTask(values: (string | number | null | Uint8Array)[]): Task {
  return {
    id: values[0] as string,
    title: values[1] as string,
    description: values[2] as string,
    repo_url: values[3] as string,
    target_branch: values[4] as string,
    context_files: safeParseJsonArray(values[5] as string),
    build_command: values[6] as string | null,
    status: values[7] as TaskStatus,
    pr_url: values[8] as string | null,
    error: values[9] as string | null,
    created_at: values[10] as string,
    updated_at: values[11] as string,
  };
}

/**
 * Service class for managing tasks.
 */
export class TaskService {
  /**
   * Creates a new task with the given input.
   */
  create(input: CreateTaskInput): Task {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    const contextFiles = JSON.stringify(input.context_files ?? []);

    logger.info('Creating task', { id, title: input.title });

    db.run(
      `INSERT INTO tasks (id, title, description, repo_url, target_branch, context_files, build_command, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.title,
        input.description,
        input.repo_url,
        input.target_branch ?? 'main',
        contextFiles,
        input.build_command ?? null,
        now,
        now,
      ]
    );

    saveDatabase();

    const task = this.getById(id);
    if (task === null) {
      throw new Error('Failed to create task');
    }

    logger.info('Task created successfully', { id });
    return task;
  }

  /**
   * Retrieves all tasks, ordered by creation date (newest first).
   */
  getAll(): Task[] {
    const db = getDatabase();
    logger.debug('Fetching all tasks');

    const result = db.exec('SELECT * FROM tasks ORDER BY created_at DESC');
    if (result.length === 0 || result[0] === undefined) {
      return [];
    }

    return result[0].values.map(rowToTask);
  }

  /**
   * Retrieves a task by its ID.
   * Returns null if the task doesn't exist.
   */
  getById(id: string): Task | null {
    const db = getDatabase();
    logger.debug('Fetching task by ID', { id });

    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
    stmt.bind([id]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const values = stmt.get();
    stmt.free();

    if (!values || values.length === 0) {
      return null;
    }

    return rowToTask(values);
  }

  /**
   * Updates a task with the given input.
   * Returns the updated task, or null if the task doesn't exist.
   */
  update(id: string, input: UpdateTaskInput): Task | null {
    const db = getDatabase();
    logger.info('Updating task', { id, fields: Object.keys(input) });

    const existing = this.getById(id);
    if (existing === null) {
      logger.warn('Task not found for update', { id });
      return null;
    }

    const entries: [string, string | null][] = [];
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined && ALLOWED_UPDATE_COLUMNS.has(key)) {
        entries.push([key, key === 'context_files' ? JSON.stringify(value) : value as string | null]);
      }
    }

    if (entries.length === 0) {
      return existing;
    }

    const sets = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([_, v]) => v);

    const sql = `UPDATE tasks SET ${sets}, updated_at = ? WHERE id = ?`;
    const params = [...values, new Date().toISOString(), id];

    logger.debug('Executing UPDATE', { sql, params, id });

    try {
      db.run(sql, params);
    } catch (error) {
      logger.error('UPDATE failed', { id, error });
      throw error;
    }

    // Verify the update was applied by checking the row count
    const changes = db.getRowsModified();
    logger.debug('Rows modified by UPDATE', { id, changes });

    if (changes === 0) {
      logger.warn('No rows modified by UPDATE - task may not exist', { id });
    }

    // Save to disk immediately after update
    saveDatabase();

    // Fetch and return the updated task
    const updatedTask = this.getById(id);

    if (updatedTask) {
      // Log the actual status to help debug sync issues
      logger.info('Task updated successfully', {
        id,
        newStatus: updatedTask.status,
        updatedAt: updatedTask.updated_at
      });
    }

    return updatedTask;
  }

  /**
   * Deletes a task by its ID.
   * Returns true if the task was deleted, false if it didn't exist.
   */
  delete(id: string): boolean {
    const db = getDatabase();
    logger.info('Deleting task', { id });

    // Check if task exists first
    const existing = this.getById(id);
    if (existing === null) {
      logger.warn('Task not found for deletion', { id });
      return false;
    }

    db.run('DELETE FROM tasks WHERE id = ?', [id]);
    saveDatabase();

    logger.info('Task deleted successfully', { id });
    return true;
  }

  /**
   * Retrieves tasks by status.
   */
  getByStatus(status: TaskStatus): Task[] {
    const db = getDatabase();
    logger.debug('Fetching tasks by status', { status });

    const stmt = db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC');
    stmt.bind([status]);

    const tasks: Task[] = [];
    while (stmt.step()) {
      const values = stmt.get();
      if (values && values.length > 0) {
        tasks.push(rowToTask(values));
      }
    }
    stmt.free();

    return tasks;
  }
}

/** Singleton service instance */
export const taskService = new TaskService();

export default taskService;
