import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { getConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { repoUrlToDir, toAuthenticatedCloneUrl, parseGitHubUrl } from '../utils/github-url.js';
import { killProcessesForTask, killProcessesInDirectory } from '../utils/process-killer.js';
import { getGitHubCredentials } from './secrets.service.js';

const logger = createLogger('git-service');

/**
 * Result of executing a git command.
 */
interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Information about a changed file in a worktree.
 */
export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
  /** Content of the file in the base branch (undefined for binary files or if too large) */
  oldContent?: string;
  /** Content of the file in the current worktree (undefined for binary files or if too large) */
  newContent?: string;
}

/**
 * Information about an active worktree.
 */
interface WorktreeInfo {
  taskId: string;
  worktreePath: string;
  branchName: string;
  bareRepoPath: string;
}

/**
 * Result of setupWorktree operation.
 */
export interface SetupWorktreeResult {
  /** The path to the worktree */
  worktreePath: string;
  /** Whether an existing worktree was reused */
  reused: boolean;
  /** The branch name */
  branchName: string;
  /** Whether the repository is empty (no commits) */
  isEmptyRepo: boolean;
}

/**
 * Map to track active worktrees by task ID.
 */
const activeWorktrees = new Map<string, WorktreeInfo>();

/**
 * UUID v4 regex pattern for validation.
 */
const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Validates that a task ID is a valid UUID format.
 * This prevents path traversal attacks when constructing file paths.
 *
 * @param taskId - The task ID to validate
 * @throws Error if the task ID is not a valid UUID
 */
function validateTaskId(taskId: string): void {
  if (!UUID_REGEX.test(taskId)) {
    throw new Error('Invalid task ID format');
  }
}

/**
 * Escapes an argument for shell execution on Windows.
 */
function escapeArg(arg: string): string {
  if (process.platform !== 'win32') return arg;
  // If arg contains spaces, quotes, or special chars, wrap in double quotes
  if (/[\s"&|<>^]/.test(arg)) {
    // Escape existing double quotes
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}

/**
 * Executes a git command and returns the result.
 * Uses spawn for better handling of large outputs and Windows compatibility.
 *
 * @param args - Arguments to pass to git
 * @param cwd - Working directory for the command
 * @param env - Additional environment variables
 * @returns The command result
 */
async function execGit(
  args: string[],
  cwd?: string,
  env?: Record<string, string>
): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    const useShell = process.platform === 'win32';
    const escapedArgs = useShell ? args.map(escapeArg) : args;

    const gitProcess = spawn('git', escapedArgs, {
      cwd,
      env: { ...process.env, ...env },
      shell: useShell,
    });

    let stdout = '';
    let stderr = '';

    gitProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    gitProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    gitProcess.on('error', (error) => {
      reject(new Error(`Failed to execute git: ${error.message}`));
    });

    gitProcess.on('close', (exitCode) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: exitCode ?? 1,
      });
    });
  });
}

/**
 * Executes a git command and throws an error if it fails.
 *
 * @param args - Arguments to pass to git
 * @param cwd - Working directory for the command
 * @param env - Additional environment variables
 * @returns The stdout output
 * @throws Error if the command fails
 */
async function execGitOrThrow(
  args: string[],
  cwd?: string,
  env?: Record<string, string>
): Promise<string> {
  const result = await execGit(args, cwd, env);
  if (result.exitCode !== 0) {
    throw new Error(`Git command failed: git ${args.join(' ')}\nStderr: ${result.stderr}`);
  }
  return result.stdout;
}

/**
 * Ensures a directory exists, creating it if necessary.
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Checks if a directory exists.
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Delays execution for a specified number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Removes a directory with retry logic for EBUSY errors (common on Windows).
 * Uses exponential backoff with jitter.
 *
 * @param dirPath - The directory to remove
 * @param maxRetries - Maximum number of retry attempts (default: 5)
 * @param baseDelayMs - Base delay in milliseconds (default: 500)
 * @throws Error if removal fails after all retries
 */
async function removeDirectoryWithRetry(
  dirPath: string,
  maxRetries: number = 5,
  baseDelayMs: number = 500
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return; // Success
    } catch (error) {
      lastError = error as Error;
      const fsError = error as NodeJS.ErrnoException;

      // Only retry for EBUSY, EPERM, or ENOTEMPTY errors
      // These are common on Windows when files are locked
      if (
        fsError.code !== 'EBUSY' &&
        fsError.code !== 'EPERM' &&
        fsError.code !== 'ENOTEMPTY' &&
        fsError.code !== 'EACCES'
      ) {
        throw error;
      }

      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const jitter = Math.random() * 200;
        const delayMs = baseDelayMs * Math.pow(2, attempt) + jitter;
        logger.debug('Directory removal failed, retrying', {
          dirPath,
          attempt: attempt + 1,
          maxRetries,
          delayMs: Math.round(delayMs),
          errorCode: fsError.code,
        });
        await delay(delayMs);
      }
    }
  }

  throw lastError ?? new Error(`Failed to remove directory after ${maxRetries} retries: ${dirPath}`);
}

/**
 * Git Service for managing bare repositories and worktrees.
 * This service enables isolated execution environments for tasks.
 */
export class GitService {
  private readonly reposBaseDir: string;
  private readonly worktreesDir: string;

  constructor() {
    const config = getConfig();
    this.reposBaseDir = config.reposBaseDir;
    this.worktreesDir = config.worktreesDir;
  }

  /**
   * Gets the GitHub token from secrets service (primary) or config (fallback).
   * This allows the token to be updated at runtime via the dashboard.
   */
  private get githubToken(): string {
    // Try to get from secrets service first (configured via dashboard)
    const credentials = getGitHubCredentials();
    if (credentials?.token) {
      return credentials.token;
    }
    // Fallback to config (environment variable)
    return getConfig().githubToken;
  }

  /**
   * Checks if a bare repository is empty (has no commits).
   * An empty repository has no branches and no commits.
   *
   * @param bareRepoPath - Path to the bare repository
   * @returns True if the repository has no commits
   */
  async isEmptyRepo(bareRepoPath: string): Promise<boolean> {
    // Try to list branches - an empty repo has no branches
    const result = await execGit(['branch', '--list'], bareRepoPath);

    // If no branches exist, the repository is empty
    if (result.exitCode === 0 && result.stdout.trim() === '') {
      // Double-check by trying to get any commit
      const revParseResult = await execGit(['rev-parse', '--verify', 'HEAD'], bareRepoPath);
      if (revParseResult.exitCode !== 0) {
        logger.info('Repository is empty (no commits)', { bareRepoPath });
        return true;
      }
    }

    return false;
  }

  /**
   * Ensures the bare repository exists, cloning if not present.
   * Bare repos are used as the central repository for worktrees.
   *
   * @param repoUrl - The GitHub repository URL
   * @returns The path to the bare repository
   */
  async ensureBareRepo(repoUrl: string): Promise<string> {
    const dirName = repoUrlToDir(repoUrl);
    const bareRepoPath = path.join(this.reposBaseDir, `${dirName}.git`);

    logger.debug('Ensuring bare repo exists', { repoUrl, bareRepoPath });

    // Ensure base directory exists
    await ensureDir(this.reposBaseDir);

    // Check if bare repo already exists
    if (await directoryExists(bareRepoPath)) {
      logger.info('Bare repo already exists', { bareRepoPath });
      return bareRepoPath;
    }

    logger.info('Cloning bare repository', { repoUrl, bareRepoPath });

    // Clone as bare repository with authentication
    const cloneUrl = this.githubToken
      ? toAuthenticatedCloneUrl(repoUrl, this.githubToken)
      : repoUrl;

    try {
      await execGitOrThrow(['clone', '--bare', cloneUrl, bareRepoPath]);
      logger.info('Bare repository cloned successfully', { bareRepoPath });
    } catch (error) {
      // Clean up partial clone on failure
      await fs.rm(bareRepoPath, { recursive: true, force: true }).catch((cleanupError) => {
        logger.debug('Failed to cleanup partial clone on failure', {
          bareRepoPath,
          error: getErrorMessage(cleanupError),
        });
      });
      throw error;
    }

    return bareRepoPath;
  }

  /**
   * Fetches the latest changes from origin in a bare repository.
   * Updates local branches to match their remote counterparts.
   * Handles empty repositories gracefully by skipping fetch operations.
   *
   * @param bareRepoPath - Path to the bare repository
   * @param targetBranch - Optional branch to specifically update (e.g., 'main')
   * @returns True if fetch was successful or skipped (empty repo), false otherwise
   */
  async fetchRepo(bareRepoPath: string, targetBranch?: string): Promise<void> {
    logger.debug('Fetching latest changes', { bareRepoPath, targetBranch });

    // Check if repository is empty - if so, skip fetch
    const isEmpty = await this.isEmptyRepo(bareRepoPath);
    if (isEmpty) {
      logger.info('Skipping fetch for empty repository', { bareRepoPath });
      return;
    }

    // Set up authentication for fetch if we have a token
    const env: Record<string, string> = {};
    if (this.githubToken) {
      // Use credential helper to provide token
      env['GIT_ASKPASS'] = 'echo';
      env['GIT_USERNAME'] = 'x-access-token';
      env['GIT_PASSWORD'] = this.githubToken;
    }

    // Fetch all changes first
    await execGitOrThrow(['fetch', 'origin', '--prune'], bareRepoPath, env);

    // If a target branch is specified, update the local branch to match origin
    // In a bare repo, we need to explicitly update the local ref
    if (targetBranch) {
      try {
        // Update local branch ref to match origin
        // This is equivalent to: git update-ref refs/heads/main refs/remotes/origin/main
        await execGitOrThrow(
          ['fetch', 'origin', `${targetBranch}:${targetBranch}`, '--force'],
          bareRepoPath,
          env
        );
        logger.debug('Updated local branch from origin', { targetBranch });
      } catch (error) {
        logger.warn('Could not update local branch ref, will use existing', {
          targetBranch,
          error: getErrorMessage(error),
        });
      }
    }

    logger.info('Repository fetched successfully', { bareRepoPath });
  }

  /**
   * Sets up a worktree for a task, reusing an existing one if available.
   * This is the preferred method to use when starting/retrying agent execution.
   *
   * If a worktree already exists for the task, it will be reused.
   * Otherwise, a new worktree will be created.
   *
   * @param taskId - Unique identifier for the task
   * @param repoUrl - The GitHub repository URL
   * @param targetBranch - The branch to base the worktree on (e.g., 'main')
   * @returns Result containing the worktree path and whether it was reused
   */
  async setupWorktree(
    taskId: string,
    repoUrl: string,
    targetBranch: string = 'main'
  ): Promise<SetupWorktreeResult> {
    validateTaskId(taskId);

    const worktreePath = path.join(this.worktreesDir, `task-${taskId}`);
    const branchName = `feature/task-${taskId}`;

    // Check if worktree already exists on disk
    if (await directoryExists(worktreePath)) {
      // Verify it's a valid git worktree by checking for .git file
      const gitFilePath = path.join(worktreePath, '.git');
      let isValidWorktree = false;

      try {
        const stat = await fs.stat(gitFilePath);
        if (stat.isFile()) {
          // .git file exists, check if it points to a valid bare repo
          const gitFileContent = await fs.readFile(gitFilePath, 'utf-8');
          if (gitFileContent.includes('gitdir:')) {
            isValidWorktree = true;
          }
        }
      } catch {
        // .git file doesn't exist or isn't readable
      }

      if (isValidWorktree) {
        logger.info('Reusing existing worktree for task', { taskId, worktreePath });

        // Ensure bare repo is up to date for subsequent operations (including the target branch)
        const bareRepoPath = await this.ensureBareRepo(repoUrl);

        // Check if repository is empty before trying to fetch/merge
        const isEmptyRepo = await this.isEmptyRepo(bareRepoPath);

        if (!isEmptyRepo) {
          await this.fetchRepo(bareRepoPath, targetBranch);

          // Merge latest changes from targetBranch to keep branch up to date
          // The local targetBranch ref was updated by fetchRepo to match origin
          logger.debug('Merging latest changes into existing worktree', { targetBranch });
          try {
            await execGitOrThrow(['merge', targetBranch, '--no-edit'], worktreePath);
            logger.debug('Successfully merged latest changes', { targetBranch });
          } catch (mergeError) {
            logger.warn('Could not auto-merge latest changes, branch may have conflicts', {
              targetBranch,
              error: getErrorMessage(mergeError),
            });
          }
        } else {
          logger.debug('Skipping merge for empty repository', { bareRepoPath });
        }

        // Re-track the worktree in memory if not already tracked
        if (!activeWorktrees.has(taskId)) {
          activeWorktrees.set(taskId, {
            taskId,
            worktreePath,
            branchName,
            bareRepoPath,
          });
        }

        return {
          worktreePath,
          reused: true,
          branchName,
          isEmptyRepo,
        };
      } else {
        // Directory exists but is not a valid worktree - clean it up
        logger.warn('Invalid worktree directory found, cleaning up', { worktreePath });

        // Try multiple cleanup strategies for invalid worktree directories
        let cleanupSucceeded = false;
        let lastCleanupError: Error | null = null;

        // Strategy 1: Direct removal with retry (handles EBUSY on Windows)
        try {
          await removeDirectoryWithRetry(worktreePath, 5, 1000);
          cleanupSucceeded = true;
          logger.debug('Invalid worktree removed via direct removal', { worktreePath });
        } catch (error) {
          lastCleanupError = error as Error;
          logger.warn('Direct removal failed for invalid worktree', {
            worktreePath,
            error: getErrorMessage(error),
          });
        }

        // Strategy 2: If direct removal failed, try removing contents first then directory
        if (!cleanupSucceeded) {
          try {
            // Wait a bit for any file handles to be released
            await delay(2000);

            // Try to remove .git file/folder first (common issue on Windows)
            const gitPath = path.join(worktreePath, '.git');
            try {
              await fs.rm(gitPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
              logger.debug('Removed .git from invalid worktree', { gitPath });
            } catch {
              // Ignore - .git might not exist or already removed
            }

            // Now try removing the whole directory again
            await removeDirectoryWithRetry(worktreePath, 5, 1000);
            cleanupSucceeded = true;
            logger.debug('Invalid worktree removed via staged removal', { worktreePath });
          } catch (error) {
            lastCleanupError = error as Error;
            logger.warn('Staged removal failed for invalid worktree', {
              worktreePath,
              error: getErrorMessage(error),
            });
          }
        }

        // Strategy 3: Last resort - try to force remove using shell on Windows
        if (!cleanupSucceeded && process.platform === 'win32') {
          try {
            await delay(1000);
            const rmResult = await execGit(['rm', '-rf', worktreePath.replace(/\\/g, '/')]);
            if (rmResult.exitCode === 0) {
              cleanupSucceeded = true;
              logger.debug('Invalid worktree removed via git rm', { worktreePath });
            }
          } catch {
            // git rm failed, that's okay
          }

          // Check if directory actually got removed
          if (!cleanupSucceeded && !(await directoryExists(worktreePath))) {
            cleanupSucceeded = true;
            logger.debug('Invalid worktree no longer exists', { worktreePath });
          }
        }

        // Final check - verify directory is actually gone
        if (await directoryExists(worktreePath)) {
          const fsError = lastCleanupError as NodeJS.ErrnoException | null;
          const errorCode = fsError?.code ?? 'UNKNOWN';
          logger.error('Failed to remove invalid worktree directory after all strategies', {
            worktreePath,
            errorCode,
            error: getErrorMessage(lastCleanupError),
          });
          throw new Error(
            `Failed to clean up invalid worktree: ${worktreePath}. ` +
            `Error: ${errorCode}. ` +
            `The directory may be locked by another process (e.g., antivirus, file explorer, IDE). ` +
            `Try closing applications that might have files open in this directory.`
          );
        }

        logger.info('Invalid worktree directory cleaned up successfully', { worktreePath });
      }
    }

    // No existing worktree, create a new one
    const createResult = await this.createWorktree(taskId, repoUrl, targetBranch);

    return {
      worktreePath: createResult.worktreePath,
      reused: false,
      branchName,
      isEmptyRepo: createResult.isEmptyRepo,
    };
  }

/**
   * Creates a new worktree for a task.
   * WARNING: This will fail if a worktree already exists. Use setupWorktree() instead
   * for retry/resume scenarios where you want to reuse existing worktrees.
   *
   * For empty repositories (no commits), creates an orphan branch and initializes
   * a basic worktree structure for the agent to build upon.
   *
   * @param taskId - Unique identifier for the task
   * @param repoUrl - The GitHub repository URL
   * @param targetBranch - The branch to base the worktree on (e.g., 'main')
   * @returns Object containing the worktree path and whether the repo is empty
   */
  async createWorktree(
    taskId: string,
    repoUrl: string,
    targetBranch: string = 'main'
  ): Promise<{ worktreePath: string; isEmptyRepo: boolean }> {
    validateTaskId(taskId);
    logger.info('Creating worktree for task', { taskId, repoUrl, targetBranch });

    // Ensure bare repo exists and is up to date (including the target branch)
    const bareRepoPath = await this.ensureBareRepo(repoUrl);
    await this.fetchRepo(bareRepoPath, targetBranch);

    // Check if repository is empty
    const isEmptyRepo = await this.isEmptyRepo(bareRepoPath);
    if (isEmptyRepo) {
      logger.info('Repository is empty, will create orphan branch', { taskId, bareRepoPath });
    }

    // Prune orphaned worktree references BEFORE attempting to create
    // This helps clean up stale references from previous failed cleanups
    logger.debug('Pruning orphaned worktree references before creation', { bareRepoPath });
    await execGit(['worktree', 'prune'], bareRepoPath);

    // Ensure worktrees directory exists
    await ensureDir(this.worktreesDir);

    // Define worktree path and branch name
    const worktreePath = path.join(this.worktreesDir, `task-${taskId}`);
    const branchName = `feature/task-${taskId}`;

    // Check if worktree already exists - fail if so (use setupWorktree to reuse)
    if (await directoryExists(worktreePath)) {
      const errorMsg = `Worktree already exists at ${worktreePath}. Use setupWorktree() to reuse existing worktrees.`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Also check for and clean up orphaned worktree metadata in the bare repo
    const worktreeMetadataPath = path.join(bareRepoPath, 'worktrees', `task-${taskId}`);
    if (await directoryExists(worktreeMetadataPath)) {
      logger.warn('Orphaned worktree metadata found, cleaning up', { worktreeMetadataPath });
      try {
        await removeDirectoryWithRetry(worktreeMetadataPath, 3, 200);
      } catch (error) {
        logger.warn('Failed to clean up orphaned worktree metadata', {
          worktreeMetadataPath,
          error: getErrorMessage(error),
        });
      }
      // Run prune again after cleaning up metadata
      await execGit(['worktree', 'prune'], bareRepoPath);
    }

    // Handle empty repository case - need to create orphan branch manually
    if (isEmptyRepo) {
      await this.createWorktreeForEmptyRepo(bareRepoPath, worktreePath, branchName);
    } else {
      // Normal case: repository has commits
      // Check if branch already exists
      const branchCheckResult = await execGit(
        ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
        bareRepoPath
      );

      if (branchCheckResult.exitCode === 0) {
        // Branch exists, create worktree from existing branch
        logger.debug('Branch already exists, using existing branch', { branchName });
        await execGitOrThrow(['worktree', 'add', worktreePath, branchName], bareRepoPath);

        // Merge latest changes from targetBranch to keep branch up to date
        // The local targetBranch ref was updated by fetchRepo to match origin
        logger.debug('Merging latest changes into existing branch', { targetBranch });
        try {
          await execGitOrThrow(['merge', targetBranch, '--no-edit'], worktreePath);
          logger.debug('Successfully merged latest changes', { targetBranch });
        } catch (mergeError) {
          logger.warn('Could not auto-merge latest changes, branch may have conflicts', {
            targetBranch,
            error: getErrorMessage(mergeError),
          });
        }
      } else {
        // Create new worktree with new branch based on targetBranch
        // The local targetBranch ref was updated by fetchRepo to match origin
        logger.debug('Creating new branch from target branch', { branchName, targetBranch });
        await execGitOrThrow(
          ['worktree', 'add', worktreePath, '-b', branchName, targetBranch],
          bareRepoPath
        );
      }
    }

    // Configure git user for the worktree
    await execGitOrThrow(['config', 'user.email', 'agent@agent-board.local'], worktreePath);
    await execGitOrThrow(['config', 'user.name', 'Agent Board'], worktreePath);

    // Track the worktree
    activeWorktrees.set(taskId, {
      taskId,
      worktreePath,
      branchName,
      bareRepoPath,
    });

    logger.info('Worktree created successfully', { taskId, worktreePath, branchName, isEmptyRepo });
    return { worktreePath, isEmptyRepo };
  }

  /**
   * Creates a worktree for an empty repository using an orphan branch.
   * Since there are no commits to base the worktree on, we need to:
   * 1. Create the worktree directory manually
   * 2. Initialize it as a git worktree pointing to the bare repo
   * 3. Create an orphan branch
   *
   * @param bareRepoPath - Path to the bare repository
   * @param worktreePath - Path where the worktree should be created
   * @param branchName - Name of the branch to create
   */
  private async createWorktreeForEmptyRepo(
    bareRepoPath: string,
    worktreePath: string,
    branchName: string
  ): Promise<void> {
    logger.info('Creating worktree for empty repository', { bareRepoPath, worktreePath, branchName });

    // Create the worktree directory
    await ensureDir(worktreePath);

    // Create a .git file pointing to the bare repo's worktree folder
    // First, we need to create the worktree metadata in the bare repo
    const worktreeMetadataPath = path.join(bareRepoPath, 'worktrees', path.basename(worktreePath));
    await ensureDir(worktreeMetadataPath);

    // Create the gitdir file in worktree metadata
    const gitdirPath = path.join(worktreeMetadataPath, 'gitdir');
    const gitFilePath = path.join(worktreePath, '.git');
    await fs.writeFile(gitdirPath, gitFilePath + '\n', 'utf-8');

    // Create commondir file pointing to the bare repo
    const commondirPath = path.join(worktreeMetadataPath, 'commondir');
    await fs.writeFile(commondirPath, '../..\n', 'utf-8');

    // Create the HEAD file for the worktree (pointing to the orphan branch)
    const headPath = path.join(worktreeMetadataPath, 'HEAD');
    await fs.writeFile(headPath, `ref: refs/heads/${branchName}\n`, 'utf-8');

    // Create the .git file in the worktree pointing to the metadata
    const relativeMetadataPath = path.relative(worktreePath, worktreeMetadataPath).replace(/\\/g, '/');
    await fs.writeFile(gitFilePath, `gitdir: ${relativeMetadataPath}\n`, 'utf-8');

    // Create index file (empty index for new worktree)
    const indexPath = path.join(worktreeMetadataPath, 'index');
    // Initialize an empty git index
    await execGitOrThrow(['read-tree', '--empty'], worktreePath).catch(() => {
      // If read-tree fails, create an empty index file
      logger.debug('read-tree --empty failed, creating empty index manually');
    });

    // Verify the worktree is functional by running a git command
    const statusResult = await execGit(['status'], worktreePath);
    if (statusResult.exitCode !== 0) {
      // Fallback: use git init to properly initialize
      logger.debug('Worktree setup incomplete, using git init fallback', { stderr: statusResult.stderr });

      // Remove the .git file and reinitialize
      await fs.rm(gitFilePath, { force: true });
      await fs.rm(worktreeMetadataPath, { recursive: true, force: true });

      // Initialize as regular git repo and set up as worktree manually
      await execGitOrThrow(['init'], worktreePath);
      await execGitOrThrow(['checkout', '--orphan', branchName], worktreePath);

      // Add the bare repo as origin
      const remoteResult = await execGit(['remote', 'get-url', 'origin'], bareRepoPath);
      if (remoteResult.exitCode === 0 && remoteResult.stdout.trim()) {
        await execGitOrThrow(['remote', 'add', 'origin', remoteResult.stdout.trim()], worktreePath);
      }
    }

    logger.info('Worktree for empty repository created successfully', { worktreePath, branchName });
  }

  /**
   * Checks if a worktree exists for a task.
   *
   * @param taskId - The task identifier
   * @returns True if a worktree exists on disk
   */
  async worktreeExists(taskId: string): Promise<boolean> {
    validateTaskId(taskId);
    const worktreePath = path.join(this.worktreesDir, `task-${taskId}`);
    return directoryExists(worktreePath);
  }

  /**
   * Gets the worktree path for a task.
   *
   * @param taskId - The task identifier
   * @returns The worktree path or undefined if not found
   * @throws Error if taskId is not a valid UUID
   */
  getWorktreePath(taskId: string): string | undefined {
    validateTaskId(taskId);
    // Check in-memory map first
    const tracked = activeWorktrees.get(taskId)?.worktreePath;
    if (tracked) return tracked;

    // Fallback: check if worktree exists on disk (survives server restarts)
    const diskPath = path.join(this.worktreesDir, `task-${taskId}`);
    if (existsSync(diskPath)) {
      return diskPath;
    }
    return undefined;
  }

  /**
   * Commits all changes in the worktree.
   *
   * @param worktreePath - Path to the worktree
   * @param message - The commit message
   */
  async commitChanges(worktreePath: string, message: string): Promise<void> {
    logger.debug('Committing changes', { worktreePath, message });

    // Stage all changes
    await execGitOrThrow(['add', '-A'], worktreePath);

    // Check if there are changes to commit
    const statusResult = await execGit(['status', '--porcelain'], worktreePath);
    if (statusResult.stdout === '') {
      logger.info('No changes to commit', { worktreePath });
      return;
    }

    // Commit changes
    await execGitOrThrow(['commit', '-m', message], worktreePath);
    logger.info('Changes committed successfully', { worktreePath });
  }

  /**
   * Pushes the branch to the remote origin.
   *
   * @param worktreePath - Path to the worktree
   * @param branchName - Name of the branch to push
   */
  async pushBranch(worktreePath: string, branchName: string): Promise<void> {
    logger.debug('Pushing branch', { worktreePath, branchName });

    // Set up authentication for push if we have a token
    const env: Record<string, string> = {};
    if (this.githubToken) {
      env['GIT_ASKPASS'] = 'echo';
      env['GIT_USERNAME'] = 'x-access-token';
      env['GIT_PASSWORD'] = this.githubToken;
    }

    // Get the remote URL and update it with authentication
    if (this.githubToken) {
      const remoteResult = await execGit(['remote', 'get-url', 'origin'], worktreePath);
      if (remoteResult.exitCode === 0) {
        const remoteUrl = remoteResult.stdout;
        try {
          const parsed = parseGitHubUrl(remoteUrl);
          const authUrl = toAuthenticatedCloneUrl(
            `https://github.com/${parsed.owner}/${parsed.repo}`,
            this.githubToken
          );
          await execGitOrThrow(['remote', 'set-url', 'origin', authUrl], worktreePath);
        } catch (error) {
          // If parsing fails, continue with existing URL
          logger.warn('Could not parse remote URL for authentication', {
            remoteUrl,
            error: getErrorMessage(error),
          });
        }
      }
    }

    await execGitOrThrow(['push', '-u', 'origin', branchName], worktreePath, env);
    logger.info('Branch pushed successfully', { branchName });
  }

  /**
   * Finds the bare repo path for a worktree.
   * Tries multiple strategies to locate the bare repo.
   *
   * @param worktreePath - The path to the worktree
   * @param taskId - The task identifier
   * @returns The bare repo path or undefined if not found
   */
  private async findBareRepoPath(worktreePath: string, taskId: string): Promise<string | undefined> {
    // Strategy 1: Check active worktrees map
    const worktreeInfo = activeWorktrees.get(taskId);
    if (worktreeInfo?.bareRepoPath) {
      return worktreeInfo.bareRepoPath;
    }

    // Strategy 2: Read from worktree's .git file (if it's a valid worktree)
    try {
      const gitFilePath = path.join(worktreePath, '.git');
      const gitFileContent = await fs.readFile(gitFilePath, 'utf-8');
      // Format: "gitdir: /path/to/bare.git/worktrees/task-xxx"
      const gitDirMatch = gitFileContent.match(/gitdir:\s*(.+)/);
      if (gitDirMatch && gitDirMatch[1]) {
        const gitDir = gitDirMatch[1].trim();
        // Handle both forward and backslashes for Windows compatibility
        const worktreesIndex = Math.max(
          gitDir.lastIndexOf('/worktrees/'),
          gitDir.lastIndexOf('\\worktrees\\')
        );
        if (worktreesIndex !== -1) {
          return gitDir.substring(0, worktreesIndex);
        }
      }
    } catch {
      // .git file doesn't exist or isn't readable
    }

    // Strategy 3: Try git rev-parse if the worktree is still valid
    try {
      const gitDirResult = await execGit(['rev-parse', '--git-dir'], worktreePath);
      if (gitDirResult.exitCode === 0) {
        const gitDir = gitDirResult.stdout;
        // Handle both forward and backslashes for Windows compatibility
        const worktreesIndex = Math.max(
          gitDir.lastIndexOf('/worktrees/'),
          gitDir.lastIndexOf('\\worktrees\\')
        );
        if (worktreesIndex !== -1) {
          return gitDir.substring(0, worktreesIndex);
        }
      }
    } catch {
      // Git command failed
    }

    // Strategy 4: Scan the repos directory for any bare repo that has this worktree
    try {
      const entries = await fs.readdir(this.reposBaseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.endsWith('.git')) {
          const candidatePath = path.join(this.reposBaseDir, entry.name);
          const worktreeRefPath = path.join(candidatePath, 'worktrees', `task-${taskId}`);
          if (await directoryExists(worktreeRefPath)) {
            return candidatePath;
          }
        }
      }
    } catch {
      // Failed to scan repos directory
    }

    return undefined;
  }

  /**
   * Removes a worktree and optionally its branch.
   * Includes robust error handling for Windows EBUSY errors.
   *
   * @param taskId - The task identifier
   * @param removeBranch - Whether to also remove the branch (default: false)
   * @throws Error if removal fails after all retry strategies (unless directory is already gone)
   */
  async cleanupWorktree(taskId: string, removeBranch: boolean = false): Promise<void> {
    validateTaskId(taskId);
    const worktreeInfo = activeWorktrees.get(taskId);
    const worktreePath = worktreeInfo?.worktreePath ?? path.join(this.worktreesDir, `task-${taskId}`);

    logger.debug('Cleaning up worktree', { taskId, worktreePath });

    // IMPORTANT: Kill any processes associated with this task FIRST
    // This prevents EBUSY errors on Windows when processes have files open
    logger.debug('Killing processes for task before cleanup', { taskId });
    killProcessesForTask(taskId);

    // Also try to kill any processes that might have files open in the worktree directory
    // This is a best-effort operation for processes not tracked by our system
    await killProcessesInDirectory(worktreePath);

    // Give the OS a moment to release file handles after killing processes
    await delay(500);

    // Find the bare repo path first (before we potentially corrupt the worktree)
    const bareRepoPath = await this.findBareRepoPath(worktreePath, taskId);

    // IMPORTANT: Run git worktree prune FIRST to clean up orphaned worktree references
    // This helps when a previous cleanup failed partway through
    if (bareRepoPath && await directoryExists(bareRepoPath)) {
      logger.debug('Pruning orphaned worktree references', { bareRepoPath });
      await execGit(['worktree', 'prune'], bareRepoPath);
    }

    // Check if worktree directory exists
    if (!(await directoryExists(worktreePath))) {
      logger.debug('Worktree directory does not exist, skipping cleanup', { worktreePath });
      activeWorktrees.delete(taskId);
      return;
    }

    // Track removal success and errors for detailed reporting
    let removalSucceeded = false;
    let lastError: Error | null = null;

    // Strategy 1: Try to remove the worktree using git worktree remove
    if (bareRepoPath && await directoryExists(bareRepoPath)) {
      try {
        await execGitOrThrow(['worktree', 'remove', '--force', worktreePath], bareRepoPath);
        removalSucceeded = true;
        logger.debug('Worktree removed via git worktree remove', { worktreePath });
      } catch (error) {
        lastError = error as Error;
        logger.warn('git worktree remove failed, will attempt direct removal', {
          worktreePath,
          error: getErrorMessage(error),
        });
      }
    }

    // Strategy 2: Direct removal with retry (handles EBUSY on Windows)
    if (!removalSucceeded && await directoryExists(worktreePath)) {
      logger.debug('Attempting direct directory removal with retry', { worktreePath });
      try {
        await removeDirectoryWithRetry(worktreePath, 5, 1000);
        removalSucceeded = true;
        logger.debug('Directory removed via direct removal', { worktreePath });
      } catch (error) {
        lastError = error as Error;
        logger.warn('Direct removal failed', {
          worktreePath,
          error: getErrorMessage(error),
        });
      }
    }

    // Strategy 3: Try removing .git file/folder first, then the rest
    if (!removalSucceeded && await directoryExists(worktreePath)) {
      logger.debug('Attempting staged removal (remove .git first)', { worktreePath });
      try {
        // Wait for potential file handles to be released
        await delay(2000);

        // Remove .git file/folder first (often the problematic part)
        const gitPath = path.join(worktreePath, '.git');
        try {
          await fs.rm(gitPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
          logger.debug('Removed .git from worktree', { gitPath });
        } catch {
          // Ignore - .git might not exist
        }

        // Now try removing the directory
        await removeDirectoryWithRetry(worktreePath, 5, 1000);
        removalSucceeded = true;
        logger.debug('Directory removed via staged removal', { worktreePath });
      } catch (error) {
        lastError = error as Error;
        logger.warn('Staged removal failed', {
          worktreePath,
          error: getErrorMessage(error),
        });
      }
    }

    // Optionally remove the branch
    if (removeBranch && bareRepoPath && worktreeInfo !== undefined) {
      try {
        await execGitOrThrow(['branch', '-D', worktreeInfo.branchName], bareRepoPath);
        logger.debug('Branch removed', { branch: worktreeInfo.branchName });
      } catch (error) {
        logger.warn('Failed to remove branch', {
          branch: worktreeInfo.branchName,
          error: getErrorMessage(error),
        });
      }
    }

    // Run git worktree prune again to clean up any remaining references
    if (bareRepoPath && await directoryExists(bareRepoPath)) {
      await execGit(['worktree', 'prune'], bareRepoPath);
    }

    // Also clean up the worktree metadata in the bare repo if it still exists
    if (bareRepoPath) {
      const worktreeMetadataPath = path.join(bareRepoPath, 'worktrees', `task-${taskId}`);
      if (await directoryExists(worktreeMetadataPath)) {
        try {
          await removeDirectoryWithRetry(worktreeMetadataPath, 3, 500);
          logger.debug('Worktree metadata cleaned up', { worktreeMetadataPath });
        } catch (error) {
          logger.warn('Failed to remove worktree metadata', {
            worktreeMetadataPath,
            error: getErrorMessage(error),
          });
        }
      }
    }

    // Final verification - check if directory still exists
    const stillExists = await directoryExists(worktreePath);
    if (stillExists) {
      const fsError = lastError as NodeJS.ErrnoException | null;
      const errorCode = fsError?.code ?? 'UNKNOWN';
      logger.error('Worktree directory still exists after cleanup attempts', {
        taskId,
        worktreePath,
        errorCode,
        error: getErrorMessage(lastError),
      });

      // Throw a descriptive error so the caller knows cleanup failed
      throw new Error(
        `Failed to clean up worktree for task ${taskId}: ${worktreePath}. ` +
        `Error: ${errorCode}. ` +
        `The directory may be locked by another process (e.g., antivirus, file explorer, IDE). ` +
        `Close any applications that might have files open in this directory and try again.`
      );
    }

    activeWorktrees.delete(taskId);
    logger.info('Worktree cleaned up successfully', { taskId });
  }

  /**
   * Gets the diff of uncommitted changes in a worktree.
   *
   * @param worktreePath - Path to the worktree
   * @returns The diff output
   */
  async getDiff(worktreePath: string): Promise<string> {
    // Get diff of staged and unstaged changes
    const stagedResult = await execGit(['diff', '--cached'], worktreePath);
    const unstagedResult = await execGit(['diff'], worktreePath);

    let diff = '';
    if (stagedResult.stdout) {
      diff += '=== Staged Changes ===\n' + stagedResult.stdout + '\n';
    }
    if (unstagedResult.stdout) {
      diff += '=== Unstaged Changes ===\n' + unstagedResult.stdout + '\n';
    }

    return diff || 'No changes detected';
  }

  /**
   * Maximum file size in bytes for including content in diff (100KB).
   */
  private static readonly MAX_CONTENT_SIZE = 100 * 1024;

  /**
   * Gets a list of changed files in a worktree with detailed stats.
   * Compares against the base branch to include committed changes.
   * For empty repositories (where base branch doesn't exist), shows all files as added.
   *
   * @param worktreePath - Path to the worktree
   * @param baseBranch - The base branch to compare against (e.g., 'main')
   * @returns Array of changed file information with content
   */
  async getChangedFiles(worktreePath: string, baseBranch: string = 'main'): Promise<ChangedFile[]> {
    // Check if base branch exists
    const baseBranchExists = await execGit(
      ['rev-parse', '--verify', baseBranch],
      worktreePath
    );

    // Use git diff against the base branch to capture ALL changes (committed + uncommitted)
    // This works even after the agent has committed changes
    // For empty repos where baseBranch doesn't exist, we'll rely on git status
    let diffResult: { exitCode: number; stdout: string; stderr: string };
    if (baseBranchExists.exitCode === 0) {
      diffResult = await execGit(
        ['diff', '--name-status', baseBranch, 'HEAD'],
        worktreePath
      );
    } else {
      // Base branch doesn't exist (empty repo case) - use --root to show all files
      logger.debug('Base branch does not exist, using root diff for empty repo', { baseBranch });
      diffResult = await execGit(
        ['diff', '--name-status', '--root', 'HEAD'],
        worktreePath
      );
    }

    // Also get uncommitted changes
    const statusResult = await execGit(['status', '--porcelain'], worktreePath);

    // Combine committed and uncommitted changes
    const fileStatuses = new Map<string, 'added' | 'modified' | 'deleted'>();

    // Process committed changes (diff against base branch)
    if (diffResult.exitCode === 0 && diffResult.stdout) {
      const lines = diffResult.stdout.split('\n').filter((line) => line.length > 0);
      for (const line of lines) {
        const [statusChar, ...pathParts] = line.split('\t');
        const filePath = pathParts.join('\t'); // Handle paths with tabs

        if (!filePath) continue;

        let status: 'added' | 'modified' | 'deleted';
        if (statusChar === 'A') {
          status = 'added';
        } else if (statusChar === 'D') {
          status = 'deleted';
        } else {
          status = 'modified';
        }
        fileStatuses.set(filePath, status);
      }
    }

    // Process uncommitted changes (override with current status if different)
    if (statusResult.exitCode === 0 && statusResult.stdout) {
      const lines = statusResult.stdout.split('\n').filter((line) => line.length > 0);
      for (const line of lines) {
        const statusCode = line.substring(0, 2);
        const filePath = line.substring(3);

        let status: 'added' | 'modified' | 'deleted';
        if (statusCode.includes('A') || statusCode === '??') {
          status = 'added';
        } else if (statusCode.includes('D')) {
          status = 'deleted';
        } else {
          status = 'modified';
        }

        // Only update if not already tracked or if status is different
        const existingStatus = fileStatuses.get(filePath);
        if (existingStatus === undefined) {
          fileStatuses.set(filePath, status);
        } else if (existingStatus === 'added' && status === 'deleted') {
          // File was added then deleted - remove from list
          fileStatuses.delete(filePath);
        }
      }
    }

    if (fileStatuses.size === 0) {
      return [];
    }

    const changedFiles: ChangedFile[] = [];

    for (const [filePath, status] of fileStatuses) {
      // Get numstat for this file
      let additions = 0;
      let deletions = 0;

      // Use appropriate numstat command based on whether base branch exists
      let numstatResult: { exitCode: number; stdout: string; stderr: string };
      if (baseBranchExists.exitCode === 0) {
        numstatResult = await execGit(
          ['diff', '--numstat', baseBranch, 'HEAD', '--', filePath],
          worktreePath
        );
      } else {
        // For empty repos, use --root to compare against empty tree
        numstatResult = await execGit(
          ['diff', '--numstat', '--root', 'HEAD', '--', filePath],
          worktreePath
        );
      }

      if (numstatResult.exitCode === 0 && numstatResult.stdout) {
        const [adds, dels] = numstatResult.stdout.split('\t');
        additions = adds === '-' ? 0 : parseInt(adds ?? '0', 10);
        deletions = dels === '-' ? 0 : parseInt(dels ?? '0', 10);
      }

      // If numstat didn't return results, check uncommitted changes
      if (additions === 0 && deletions === 0 && status !== 'deleted') {
        const uncommittedNumstat = await execGit(['diff', '--numstat', '--', filePath], worktreePath);
        if (uncommittedNumstat.exitCode === 0 && uncommittedNumstat.stdout) {
          const [adds, dels] = uncommittedNumstat.stdout.split('\t');
          additions = adds === '-' ? 0 : parseInt(adds ?? '0', 10);
          deletions = dels === '-' ? 0 : parseInt(dels ?? '0', 10);
        }
      }

      // Get file content based on status
      let oldContent: string | undefined;
      let newContent: string | undefined;

      try {
        switch (status) {
          case 'added':
            oldContent = '';
            newContent = await this.getFileContent(worktreePath, filePath) ?? undefined;
            // Check size limit
            if (newContent && newContent.length > GitService.MAX_CONTENT_SIZE) {
              newContent = undefined;
            }
            // Count lines for new files if numstat didn't work
            if (additions === 0 && newContent) {
              additions = newContent.split('\n').length;
            }
            break;

          case 'deleted':
            // For empty repos, this case shouldn't happen, but handle gracefully
            if (baseBranchExists.exitCode === 0) {
              oldContent = await this.getFileContentAtRef(worktreePath, filePath, baseBranch) ?? undefined;
            } else {
              oldContent = ''; // No previous content in empty repo
            }
            newContent = '';
            // Check size limit
            if (oldContent && oldContent.length > GitService.MAX_CONTENT_SIZE) {
              oldContent = undefined;
            }
            break;

          case 'modified':
            // For empty repos, treat as added (no previous content)
            if (baseBranchExists.exitCode === 0) {
              oldContent = await this.getFileContentAtRef(worktreePath, filePath, baseBranch) ?? undefined;
            } else {
              oldContent = ''; // No previous content in empty repo
            }
            newContent = await this.getFileContent(worktreePath, filePath) ?? undefined;
            // Check size limits
            if (oldContent && oldContent.length > GitService.MAX_CONTENT_SIZE) {
              oldContent = undefined;
            }
            if (newContent && newContent.length > GitService.MAX_CONTENT_SIZE) {
              newContent = undefined;
            }
            break;
        }
      } catch (error) {
        logger.debug('Failed to get file content for diff', { filePath, status, error: getErrorMessage(error) });
        // Continue without content
      }

      // Build the changed file object, only including content if defined
      const changedFile: ChangedFile = {
        path: filePath,
        status,
        additions,
        deletions,
      };

      // Only add content properties if they have a value (including empty string)
      if (oldContent !== undefined) {
        changedFile.oldContent = oldContent;
      }
      if (newContent !== undefined) {
        changedFile.newContent = newContent;
      }

      changedFiles.push(changedFile);
    }

    return changedFiles;
  }

  /**
   * Gets the current branch name in a worktree.
   *
   * @param worktreePath - Path to the worktree
   * @returns The current branch name
   */
  async getCurrentBranch(worktreePath: string): Promise<string> {
    const result = await execGitOrThrow(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
    return result;
  }

  /**
   * Gets the latest commit hash in a worktree.
   *
   * @param worktreePath - Path to the worktree
   * @returns The commit hash
   */
  async getLatestCommit(worktreePath: string): Promise<string> {
    const result = await execGitOrThrow(['rev-parse', 'HEAD'], worktreePath);
    return result;
  }

  /**
   * Checks if a worktree has uncommitted changes.
   *
   * @param worktreePath - Path to the worktree
   * @returns True if there are uncommitted changes
   */
  async hasChanges(worktreePath: string): Promise<boolean> {
    const result = await execGit(['status', '--porcelain'], worktreePath);
    return result.stdout.length > 0;
  }

  /**
   * Reads the content of a file in the current worktree.
   *
   * @param worktreePath - Path to the worktree
   * @param filePath - Relative path to the file within the worktree
   * @returns The file content, or null if the file doesn't exist or is binary
   */
  async getFileContent(worktreePath: string, filePath: string): Promise<string | null> {
    try {
      const fullPath = path.join(worktreePath, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');

      // Check for binary content (null bytes)
      if (content.includes('\0')) {
        return null;
      }

      return content;
    } catch (error) {
      logger.debug('Failed to read file content', { worktreePath, filePath, error: getErrorMessage(error) });
      return null;
    }
  }

  /**
   * Reads the content of a file at a specific git reference (commit, branch, tag).
   *
   * @param worktreePath - Path to the worktree
   * @param filePath - Relative path to the file
   * @param ref - Git reference (e.g., 'HEAD', 'main', commit hash)
   * @returns The file content, or null if the file doesn't exist at that ref or is binary
   */
  async getFileContentAtRef(worktreePath: string, filePath: string, ref: string): Promise<string | null> {
    try {
      const result = await execGit(['show', `${ref}:${filePath}`], worktreePath);

      if (result.exitCode !== 0) {
        // File doesn't exist at this ref
        return null;
      }

      const content = result.stdout;

      // Check for binary content (null bytes)
      if (content.includes('\0')) {
        return null;
      }

      return content;
    } catch (error) {
      logger.debug('Failed to read file at ref', { worktreePath, filePath, ref, error: getErrorMessage(error) });
      return null;
    }
  }
}

/**
 * Singleton instance of the Git service.
 */
let gitServiceInstance: GitService | null = null;

/**
 * Gets the Git service instance.
 * Creates a new instance if one doesn't exist.
 */
export function getGitService(): GitService {
  if (gitServiceInstance === null) {
    gitServiceInstance = new GitService();
  }
  return gitServiceInstance;
}

export default getGitService;
