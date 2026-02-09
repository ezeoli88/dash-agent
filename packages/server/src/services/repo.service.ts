import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/database.js';
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
 * Get active task count for a repository URL from the tasks DB table.
 * Tasks are still persisted in SQLite, so we query the DB for counts.
 */
function getActiveTaskCount(repoUrl: string): number {
  try {
    const db = getDatabase();
    const result = db.exec(
      `SELECT COUNT(*) as count FROM tasks WHERE repo_url = ? AND status NOT IN ('done', 'failed', 'cancelled')`,
      [repoUrl]
    );
    if (result.length > 0 && result[0] && result[0].values[0]) {
      return result[0].values[0][0] as number;
    }
  } catch {
    // DB might not be initialized yet or tasks table might not exist
  }
  return 0;
}

/**
 * Get active task counts grouped by repo_url from the tasks DB table.
 */
function getActiveTaskCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  try {
    const db = getDatabase();
    const result = db.exec(
      `SELECT repo_url, COUNT(*) as count FROM tasks WHERE status NOT IN ('done', 'failed', 'cancelled') GROUP BY repo_url`
    );
    if (result.length > 0 && result[0]) {
      for (const row of result[0].values) {
        const url = row[0] as string;
        const count = row[1] as number;
        counts.set(url, count);
      }
    }
  } catch {
    // DB might not be initialized yet or tasks table might not exist
  }
  return counts;
}

/**
 * Repository service for managing repositories.
 *
 * Repositories are stored in-memory only. When the server restarts,
 * all repo data is lost and the user must re-select repos on the /repos page.
 * Tasks still reference repository_id in the DB, but the repo metadata itself
 * is ephemeral.
 */
export class RepoService {
  /** In-memory store keyed by repository ID */
  private repos = new Map<string, Repository>();

  /**
   * Create a new repository
   */
  async createRepository(input: CreateRepositoryInput, githubToken?: string): Promise<Repository> {
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

    this.repos.set(id, repository);

    logger.info('Repository created successfully (in-memory)', { id, name: input.name });

    return { ...repository };
  }

  /**
   * Create a new repository with a pre-computed stack (no GitHub API call)
   */
  async createRepositoryWithStack(input: CreateRepositoryInput, detectedStack: DetectedStack): Promise<Repository> {
    const id = uuidv4();
    const now = new Date().toISOString();

    logger.info('Creating repository with pre-computed stack', { name: input.name, url: input.url });

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

    this.repos.set(id, repository);

    logger.info('Repository created successfully with stack (in-memory)', { id, name: input.name });

    return { ...repository };
  }

  /**
   * Get all repositories
   */
  async getRepositories(): Promise<Repository[]> {
    const repositories = Array.from(this.repos.values())
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    // Get active task counts from the DB (tasks are still persisted)
    const taskCounts = getActiveTaskCounts();

    for (const repo of repositories) {
      repo.active_tasks_count = taskCounts.get(repo.url) ?? 0;
    }

    return repositories.map((r) => ({ ...r }));
  }

  /**
   * Get a repository by ID
   */
  async getRepositoryById(id: string): Promise<Repository | null> {
    const repo = this.repos.get(id);
    if (!repo) {
      return null;
    }

    // Get active task count from the DB
    repo.active_tasks_count = getActiveTaskCount(repo.url);

    return { ...repo };
  }

  /**
   * Update a repository
   */
  async updateRepository(id: string, input: UpdateRepositoryInput): Promise<Repository | null> {
    const repo = this.repos.get(id);
    if (!repo) {
      return null;
    }

    const now = new Date().toISOString();

    if (input.default_branch !== undefined) {
      repo.default_branch = input.default_branch;
    }

    if (input.conventions !== undefined) {
      repo.conventions = input.conventions;
    }

    repo.updated_at = now;

    logger.info('Repository updated (in-memory)', { id });

    return this.getRepositoryById(id);
  }

  /**
   * Delete a repository
   */
  async deleteRepository(id: string): Promise<boolean> {
    const repo = this.repos.get(id);
    if (!repo) {
      return false;
    }

    this.repos.delete(id);

    logger.info('Repository deleted (in-memory)', { id, name: repo.name });

    return true;
  }

  /**
   * Re-detect the stack for a repository
   */
  async detectStack(id: string, githubToken: string): Promise<Repository | null> {
    const repo = this.repos.get(id);
    if (!repo) {
      return null;
    }

    const [owner, repoName] = repo.name.split('/');
    if (!owner || !repoName) {
      logger.error('Invalid repository name format', { id, name: repo.name });
      return this.getRepositoryById(id);
    }

    logger.info('Re-detecting stack for repository', { id, name: repo.name });

    const detector = createStackDetector(githubToken);
    const result = await detector.detectStack(owner, repoName, repo.default_branch);

    repo.detected_stack = result.detected_stack;
    repo.updated_at = new Date().toISOString();

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
    const repo = this.repos.get(id);
    if (!repo) {
      return null;
    }

    const newPattern: LearnedPattern = {
      id: uuidv4(),
      pattern,
      learned_from_task_id: taskId,
      created_at: new Date().toISOString(),
    };

    repo.learned_patterns = [...repo.learned_patterns, newPattern];
    repo.updated_at = new Date().toISOString();

    logger.info('Learned pattern added', { repoId: id, pattern, taskId });

    return this.getRepositoryById(id);
  }

  /**
   * Clear all learned patterns from a repository
   */
  async clearLearnedPatterns(id: string): Promise<ClearPatternsResponse> {
    const repo = this.repos.get(id);
    if (!repo) {
      return { success: false, cleared_count: 0 };
    }

    const clearedCount = repo.learned_patterns.length;

    repo.learned_patterns = [];
    repo.updated_at = new Date().toISOString();

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
    const repo = this.repos.get(repoId);
    if (!repo) {
      return { success: false, notFound: 'repo' };
    }

    const patternIndex = repo.learned_patterns.findIndex(
      (p) => p.id === patternId
    );

    if (patternIndex === -1) {
      return { success: false, notFound: 'pattern' };
    }

    repo.learned_patterns = repo.learned_patterns.filter(
      (p) => p.id !== patternId
    );
    repo.updated_at = new Date().toISOString();

    logger.info('Learned pattern deleted', { repoId, patternId });

    return { success: true };
  }

  /**
   * Get a repository by URL
   */
  async getRepositoryByUrl(url: string): Promise<Repository | null> {
    for (const repo of this.repos.values()) {
      if (repo.url === url) {
        return { ...repo };
      }
    }
    return null;
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
