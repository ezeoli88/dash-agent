import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from '../db/database.js';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { createStackDetector, DEFAULT_DETECTED_STACK } from './stack-detector.service.js';
import type { DetectedStack } from './stack-detector.service.js';

/**
 * A pattern learned by the agent from user feedback
 */
export interface LearnedPattern {
  id: string;
  pattern: string;
  learned_from_task_id: string;
  created_at: string;
}

/**
 * A repository that has been added to the dashboard
 */
export interface Repository {
  id: string;
  name: string;
  url: string;
  default_branch: string;
  detected_stack: DetectedStack;
  conventions: string;
  learned_patterns: LearnedPattern[];
  active_tasks_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Input for creating a new repository
 */
export interface CreateRepositoryInput {
  name: string;
  url: string;
  default_branch: string;
}

/**
 * Input for updating a repository
 */
export interface UpdateRepositoryInput {
  default_branch?: string | undefined;
  conventions?: string | undefined;
}

/**
 * Response from clearing learned patterns
 */
export interface ClearPatternsResponse {
  success: boolean;
  cleared_count: number;
}

const logger = createLogger('repo-service');

/**
 * Database row for a repository
 */
interface RepositoryRow {
  id: string;
  name: string;
  url: string;
  default_branch: string;
  detected_stack: string | null;
  conventions: string | null;
  learned_patterns: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Parse a repository row from the database into a Repository object
 */
function parseRepositoryRow(row: RepositoryRow): Repository {
  let detectedStack: DetectedStack = DEFAULT_DETECTED_STACK;
  let learnedPatterns: LearnedPattern[] = [];

  if (row.detected_stack) {
    try {
      detectedStack = JSON.parse(row.detected_stack) as DetectedStack;
    } catch {
      logger.warn('Failed to parse detected_stack', { repoId: row.id });
    }
  }

  if (row.learned_patterns) {
    try {
      learnedPatterns = JSON.parse(row.learned_patterns) as LearnedPattern[];
    } catch {
      logger.warn('Failed to parse learned_patterns', { repoId: row.id });
    }
  }

  return {
    id: row.id,
    name: row.name,
    url: row.url,
    default_branch: row.default_branch,
    detected_stack: detectedStack,
    conventions: row.conventions ?? '',
    learned_patterns: learnedPatterns,
    active_tasks_count: 0, // Will be populated separately if needed
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Repository service for managing repositories
 */
export class RepoService {
  /**
   * Create a new repository
   */
  async createRepository(input: CreateRepositoryInput, githubToken?: string): Promise<Repository> {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    logger.info('Creating repository', { name: input.name, url: input.url });

    // Detect stack if we have a GitHub token
    let detectedStack: DetectedStack = DEFAULT_DETECTED_STACK;
    if (githubToken) {
      try {
        const [owner, repo] = input.name.split('/');
        if (owner && repo) {
          const detector = createStackDetector(githubToken);
          const result = await detector.detectStack(owner, repo, input.default_branch);
          detectedStack = result.detected_stack;
        }
      } catch (error) {
        logger.warn('Failed to detect stack during creation', {
          name: input.name,
          error: getErrorMessage(error),
        });
      }
    }

    const sql = `
      INSERT INTO repositories (id, name, url, default_branch, detected_stack, conventions, learned_patterns, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
      id,
      input.name,
      input.url,
      input.default_branch,
      JSON.stringify(detectedStack),
      '', // Empty conventions initially
      '[]', // Empty learned patterns
      now,
      now,
    ]);

    saveDatabase();

    const repository: Repository = {
      id,
      name: input.name,
      url: input.url,
      default_branch: input.default_branch,
      detected_stack: detectedStack,
      conventions: '',
      learned_patterns: [],
      active_tasks_count: 0,
      created_at: now,
      updated_at: now,
    };

    logger.info('Repository created successfully', { id, name: input.name });

    return repository;
  }

  /**
   * Create a new repository with a pre-computed stack (no GitHub API call)
   */
  async createRepositoryWithStack(input: CreateRepositoryInput, detectedStack: DetectedStack): Promise<Repository> {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    logger.info('Creating repository with pre-computed stack', { name: input.name, url: input.url });

    const sql = `
      INSERT INTO repositories (id, name, url, default_branch, detected_stack, conventions, learned_patterns, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
      id,
      input.name,
      input.url,
      input.default_branch,
      JSON.stringify(detectedStack),
      '',
      '[]',
      now,
      now,
    ]);

    saveDatabase();

    const repository: Repository = {
      id,
      name: input.name,
      url: input.url,
      default_branch: input.default_branch,
      detected_stack: detectedStack,
      conventions: '',
      learned_patterns: [],
      active_tasks_count: 0,
      created_at: now,
      updated_at: now,
    };

    logger.info('Repository created successfully with stack', { id, name: input.name });

    return repository;
  }

  /**
   * Get all repositories
   */
  async getRepositories(): Promise<Repository[]> {
    const db = getDatabase();
    const sql = 'SELECT * FROM repositories ORDER BY created_at DESC';
    const result = db.exec(sql);

    if (result.length === 0 || !result[0]) {
      return [];
    }

    const columns = result[0].columns;
    const values = result[0].values;

    const repositories: Repository[] = values.map((row) => {
      const rowObj: Record<string, unknown> = {};
      columns.forEach((col, idx) => {
        rowObj[col] = row[idx];
      });
      return parseRepositoryRow(rowObj as unknown as RepositoryRow);
    });

    // Get active task counts for each repository
    const taskCountSql = `
      SELECT repo_url, COUNT(*) as count
      FROM tasks
      WHERE status NOT IN ('done', 'failed', 'cancelled')
      GROUP BY repo_url
    `;
    const taskCountResult = db.exec(taskCountSql);

    if (taskCountResult.length > 0 && taskCountResult[0]) {
      const taskCounts = new Map<string, number>();
      for (const row of taskCountResult[0].values) {
        const url = row[0] as string;
        const count = row[1] as number;
        taskCounts.set(url, count);
      }

      for (const repo of repositories) {
        repo.active_tasks_count = taskCounts.get(repo.url) ?? 0;
      }
    }

    return repositories;
  }

  /**
   * Get a repository by ID
   */
  async getRepositoryById(id: string): Promise<Repository | null> {
    const db = getDatabase();
    const sql = 'SELECT * FROM repositories WHERE id = ?';
    const stmt = db.prepare(sql);
    stmt.bind([id]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject() as unknown as RepositoryRow;
    stmt.free();

    const repository = parseRepositoryRow(row);

    // Get active task count
    const taskCountSql = `
      SELECT COUNT(*) as count
      FROM tasks
      WHERE repo_url = ? AND status NOT IN ('done', 'failed', 'cancelled')
    `;
    const taskCountResult = db.exec(taskCountSql, [repository.url]);

    if (taskCountResult.length > 0 && taskCountResult[0] && taskCountResult[0].values[0]) {
      repository.active_tasks_count = taskCountResult[0].values[0][0] as number;
    }

    return repository;
  }

  /**
   * Update a repository
   */
  async updateRepository(id: string, input: UpdateRepositoryInput): Promise<Repository | null> {
    const db = getDatabase();
    const existing = await this.getRepositoryById(id);

    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.default_branch !== undefined) {
      updates.push('default_branch = ?');
      values.push(input.default_branch);
    }

    if (input.conventions !== undefined) {
      updates.push('conventions = ?');
      values.push(input.conventions);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const sql = `UPDATE repositories SET ${updates.join(', ')} WHERE id = ?`;
    db.run(sql, values);
    saveDatabase();

    logger.info('Repository updated', { id });

    return this.getRepositoryById(id);
  }

  /**
   * Delete a repository
   */
  async deleteRepository(id: string): Promise<boolean> {
    const db = getDatabase();
    const existing = await this.getRepositoryById(id);

    if (!existing) {
      return false;
    }

    db.run('DELETE FROM repositories WHERE id = ?', [id]);
    saveDatabase();

    logger.info('Repository deleted', { id, name: existing.name });

    return true;
  }

  /**
   * Re-detect the stack for a repository
   */
  async detectStack(id: string, githubToken: string): Promise<Repository | null> {
    const repository = await this.getRepositoryById(id);

    if (!repository) {
      return null;
    }

    const [owner, repo] = repository.name.split('/');
    if (!owner || !repo) {
      logger.error('Invalid repository name format', { id, name: repository.name });
      return repository;
    }

    logger.info('Re-detecting stack for repository', { id, name: repository.name });

    const detector = createStackDetector(githubToken);
    const result = await detector.detectStack(owner, repo, repository.default_branch);

    const db = getDatabase();
    const now = new Date().toISOString();

    db.run(
      'UPDATE repositories SET detected_stack = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(result.detected_stack), now, id]
    );
    saveDatabase();

    logger.info('Stack re-detected successfully', {
      id,
      stack: result.detected_stack,
    });

    return this.getRepositoryById(id);
  }

  /**
   * Add a learned pattern to a repository
   */
  async addLearnedPattern(
    id: string,
    pattern: string,
    taskId: string
  ): Promise<Repository | null> {
    const repository = await this.getRepositoryById(id);

    if (!repository) {
      return null;
    }

    const newPattern: LearnedPattern = {
      id: uuidv4(),
      pattern,
      learned_from_task_id: taskId,
      created_at: new Date().toISOString(),
    };

    const updatedPatterns = [...repository.learned_patterns, newPattern];

    const db = getDatabase();
    const now = new Date().toISOString();

    db.run(
      'UPDATE repositories SET learned_patterns = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(updatedPatterns), now, id]
    );
    saveDatabase();

    logger.info('Learned pattern added', { repoId: id, pattern, taskId });

    return this.getRepositoryById(id);
  }

  /**
   * Clear all learned patterns from a repository
   */
  async clearLearnedPatterns(id: string): Promise<ClearPatternsResponse> {
    const repository = await this.getRepositoryById(id);

    if (!repository) {
      return { success: false, cleared_count: 0 };
    }

    const clearedCount = repository.learned_patterns.length;

    const db = getDatabase();
    const now = new Date().toISOString();

    db.run(
      'UPDATE repositories SET learned_patterns = ?, updated_at = ? WHERE id = ?',
      ['[]', now, id]
    );
    saveDatabase();

    logger.info('Learned patterns cleared', { repoId: id, clearedCount });

    return { success: true, cleared_count: clearedCount };
  }

  /**
   * Delete a specific learned pattern from a repository
   */
  async deleteLearnedPattern(
    repoId: string,
    patternId: string
  ): Promise<{ success: boolean; notFound?: 'repo' | 'pattern' }> {
    const repository = await this.getRepositoryById(repoId);

    if (!repository) {
      return { success: false, notFound: 'repo' };
    }

    const patternIndex = repository.learned_patterns.findIndex(
      (p) => p.id === patternId
    );

    if (patternIndex === -1) {
      return { success: false, notFound: 'pattern' };
    }

    const updatedPatterns = repository.learned_patterns.filter(
      (p) => p.id !== patternId
    );

    const db = getDatabase();
    const now = new Date().toISOString();

    db.run(
      'UPDATE repositories SET learned_patterns = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(updatedPatterns), now, repoId]
    );
    saveDatabase();

    logger.info('Learned pattern deleted', { repoId, patternId });

    return { success: true };
  }

  /**
   * Get a repository by URL
   */
  async getRepositoryByUrl(url: string): Promise<Repository | null> {
    const db = getDatabase();
    const sql = 'SELECT * FROM repositories WHERE url = ?';
    const stmt = db.prepare(sql);
    stmt.bind([url]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject() as unknown as RepositoryRow;
    stmt.free();

    return parseRepositoryRow(row);
  }
}

// Singleton instance
let repoServiceInstance: RepoService | null = null;

/**
 * Get the repository service instance
 */
export function getRepoService(): RepoService {
  if (!repoServiceInstance) {
    repoServiceInstance = new RepoService();
  }
  return repoServiceInstance;
}
