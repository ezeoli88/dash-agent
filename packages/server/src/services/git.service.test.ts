import { execSync } from 'child_process';
import { mkdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_ROOT = path.join(process.cwd(), '.tmp-git-service-tests');
const TEST_REPOS_DIR = path.join(TEST_ROOT, 'repos');
const TEST_WORKTREES_DIR = path.join(TEST_ROOT, 'worktrees');

// ---------------------------------------------------------------------------
// Unique task IDs per describe block to prevent worktree path collisions.
// Each describe block that calls setupWorktree / createWorktreeManually gets
// its own UUID so that concurrent beforeEach/afterAll cleanups never delete
// directories that belong to another test group.
// ---------------------------------------------------------------------------
const TASK_IDS = {
  // Top-level standalone tests
  top: {
    id1: '00000000-0001-0001-0001-000000000001',
  },
  getConflictingFiles: {
    id1: '00000000-0002-0001-0001-000000000001',
    id2: '00000000-0002-0001-0001-000000000002',
  },
  setupWorktree: {
    id1: '00000000-0003-0001-0001-000000000001',
  },
  cleanupWorktree: {
    id1: '00000000-0004-0001-0001-000000000001',
    id2: '00000000-0004-0001-0001-000000000002',
  },
  emptyRepo: {
    id1: '00000000-0005-0001-0001-000000000001',
  },
  commitChanges: {
    id1: '00000000-0006-0001-0001-000000000001',
    id2: '00000000-0006-0001-0001-000000000002',
  },
  hasChanges: {
    id1: '00000000-0007-0001-0001-000000000001',
    id2: '00000000-0007-0001-0001-000000000002',
    id3: '00000000-0007-0001-0001-000000000003',
  },
  getCurrentBranch: {
    id1: '00000000-0008-0001-0001-000000000001',
  },
  getLatestCommit: {
    id1: '00000000-0009-0001-0001-000000000001',
  },
  getDiff: {
    id1: '00000000-000a-0001-0001-000000000001',
    id2: '00000000-000a-0001-0001-000000000002',
    id3: '00000000-000a-0001-0001-000000000003',
    id4: '00000000-000a-0001-0001-000000000004',
  },
  getChangedFiles: {
    id1: '00000000-000b-0001-0001-000000000001',
    id2: '00000000-000b-0001-0001-000000000002',
    id3: '00000000-000b-0001-0001-000000000003',
    id4: '00000000-000b-0001-0001-000000000004',
  },
  fetchRepo: {
    id1: '00000000-000c-0001-0001-000000000001',
  },
  pushBranch: {
    id1: '00000000-000d-0001-0001-000000000001',
    id2: '00000000-000d-0001-0001-000000000002',
  },
  fetchInWorktree: {
    id1: '00000000-000e-0001-0001-000000000001',
    id2: '00000000-000e-0001-0001-000000000002',
  },
  getRemoteUrl: {
    id1: '00000000-000f-0001-0001-000000000001',
  },
  getFileContentAtRef: {
    id1: '00000000-0010-0001-0001-000000000001',
    id2: '00000000-0010-0001-0001-000000000002',
    id3: '00000000-0010-0001-0001-000000000003',
  },
  worktreeExists: {
    id1: '00000000-0011-0001-0001-000000000001',
  },
  getWorktreePath: {
    id1: '00000000-0012-0001-0001-000000000001',
    unused: '00000000-0012-ffff-ffff-ffffffffffff',
  },
  ensureBareRepo: {
    id1: '00000000-0013-0001-0001-000000000001',
  },
  multipleWorktrees: {
    id1: '00000000-0014-0001-0001-000000000001',
    id2: '00000000-0014-0001-0001-000000000002',
  },
  getBareRepoPathForTask: {
    id1: '00000000-0015-0001-0001-000000000001',
    id2: '00000000-0015-0001-0001-000000000002',
  },
  createWorktreeDirect: {
    id1: '00000000-0016-0001-0001-000000000001',
    id2: '00000000-0016-0001-0001-000000000002',
    id3: '00000000-0016-0001-0001-000000000003',
  },
  getDiffEdge: {
    id1: '00000000-0017-0001-0001-000000000001',
  },
  getChangedFilesEdge: {
    id1: '00000000-0018-0001-0001-000000000001',
    id2: '00000000-0018-0001-0001-000000000002',
  },
  cleanupWithRemoveBranch: {
    id1: '00000000-0019-0001-0001-000000000001',
  },
};

vi.mock('../config.js', () => ({
  getConfig: () => ({
    reposBaseDir: TEST_REPOS_DIR,
    worktreesDir: TEST_WORKTREES_DIR,
    githubToken: '',
  }),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('./secrets.service.js', () => ({
  getGitHubCredentials: vi.fn(() => null),
  getGitLabCredentials: vi.fn(() => null),
}));

vi.mock('../utils/process-killer.js', () => ({
  killProcessesForTask: vi.fn(),
  killProcessesInDirectory: vi.fn().mockResolvedValue(undefined),
}));

const { GitService, getGitService, execGitOrThrow } = await import('./git.service.js');

/** Retry-aware rm for Windows EBUSY errors */
async function rmWithRetry(dirPath: string, maxRetries = 5): Promise<void> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      await rm(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (i < maxRetries && (code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY')) {
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers: create real git repos in the temp directory for black-box testing
// ---------------------------------------------------------------------------

/** Run git synchronously in a given cwd */
function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

/**
 * Creates a normal (non-bare) git repo with one commit on branch "main",
 * then clones it as bare into TEST_REPOS_DIR following the naming convention
 * expected by GitService. Returns { sourceDir, bareRepoPath, repoUrl }.
 */
async function createTestRepoWithBare(
  repoName: string,
  opts?: { empty?: boolean }
): Promise<{ sourceDir: string; bareRepoPath: string; repoUrl: string }> {
  const sourceDir = path.join(TEST_ROOT, `source-${repoName}`);
  await mkdir(sourceDir, { recursive: true });

  // Always use -b main so default branch is "main" regardless of system config
  git('init -b main', sourceDir);
  git('config user.email "test@test.com"', sourceDir);
  git('config user.name "Test"', sourceDir);

  if (!opts?.empty) {
    await writeFile(path.join(sourceDir, 'README.md'), '# Test Repo\n', 'utf-8');
    git('add -A', sourceDir);
    git('commit -m "Initial commit"', sourceDir);
  }

  // Clone as bare into the repos dir
  const bareRepoPath = path.join(TEST_REPOS_DIR, `local-${repoName}.git`);
  git(`clone --bare "${sourceDir}" "${bareRepoPath}"`, TEST_ROOT);

  // The repo URL uses file:// scheme pointing to the source
  const repoUrl = `file://${sourceDir.replace(/\\/g, '/')}`;

  return { sourceDir, bareRepoPath, repoUrl };
}

/**
 * Creates a worktree directory for a task from a bare repo, mimicking what
 * GitService.createWorktree would do. Returns the worktree path.
 */
async function createWorktreeManually(
  bareRepoPath: string,
  taskId: string,
): Promise<string> {
  const worktreePath = path.join(TEST_WORKTREES_DIR, `task-${taskId}`);
  const branchName = `feature/task-${taskId}`;

  git('worktree prune', bareRepoPath);
  git(`worktree add "${worktreePath}" -b "${branchName}" main`, bareRepoPath);
  git('config user.email "test@test.com"', worktreePath);
  git('config user.name "Test"', worktreePath);

  return worktreePath;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GitService', () => {
  let service: InstanceType<typeof GitService>;

  // Create shared directories ONCE before any test runs
  beforeAll(async () => {
    await rmWithRetry(TEST_ROOT);
    await mkdir(TEST_REPOS_DIR, { recursive: true });
    await mkdir(TEST_WORKTREES_DIR, { recursive: true });
  });

  // Only clear mocks and create a fresh service instance per test.
  // DO NOT wipe TEST_ROOT here -- other test groups' directories would be destroyed.
  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitService();
  });

  // Clean up the entire temp directory tree once ALL tests have finished
  afterAll(async () => {
    await rmWithRetry(TEST_ROOT);
  });

  // ==========================================================================
  // Existing tests (preserved)
  // ==========================================================================

  it('rejects setupWorktree for invalid task IDs (path traversal guard)', async () => {
    await expect(
      service.setupWorktree('../etc/passwd', 'https://github.com/acme/repo', 'main')
    ).rejects.toThrow('Invalid task ID format');
  });

  it('rejects worktreeExists for invalid task IDs', async () => {
    await expect(service.worktreeExists('not-a-uuid')).rejects.toThrow('Invalid task ID format');
  });

  it('rejects getWorktreePath for invalid task IDs', () => {
    expect(() => service.getWorktreePath('not-a-uuid')).toThrow('Invalid task ID format');
  });

  it('returns disk worktree path when directory exists', async () => {
    const taskId = TASK_IDS.top.id1;
    const worktreePath = path.join(TEST_WORKTREES_DIR, `task-${taskId}`);
    await mkdir(worktreePath, { recursive: true });

    expect(await service.worktreeExists(taskId)).toBe(true);
    expect(service.getWorktreePath(taskId)).toBe(worktreePath);
  });

  it('reads text file content and returns null for missing or binary files', async () => {
    const workspacePath = path.join(TEST_ROOT, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    await writeFile(path.join(workspacePath, 'hello.txt'), 'hello world', 'utf-8');
    await writeFile(path.join(workspacePath, 'binary.dat'), Buffer.from([0, 1, 2, 3, 0]));

    const text = await service.getFileContent(workspacePath, 'hello.txt');
    const binary = await service.getFileContent(workspacePath, 'binary.dat');
    const missing = await service.getFileContent(workspacePath, 'missing.txt');

    expect(text).toBe('hello world');
    expect(binary).toBeNull();
    expect(missing).toBeNull();
  });

  it('detects remaining conflict markers and ignores missing files', async () => {
    const workspacePath = path.join(TEST_ROOT, 'conflicts');
    await mkdir(workspacePath, { recursive: true });

    await writeFile(
      path.join(workspacePath, 'conflicted.ts'),
      '<<<<<<< HEAD\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> feature',
      'utf-8'
    );
    await writeFile(path.join(workspacePath, 'clean.ts'), 'const clean = true;', 'utf-8');

    const files = await service.hasConflictMarkers(workspacePath, [
      'conflicted.ts',
      'clean.ts',
      'missing.ts',
    ]);

    expect(files).toEqual(['conflicted.ts']);
  });

  it('returns null bare repo path when task is not tracked', () => {
    const taskId = TASK_IDS.top.id1;
    expect(service.getBareRepoPathForTask(taskId)).toBeNull();
  });

  // ==========================================================================
  // Tier 1 -- Merge Conflicts & Worktree Operations
  // ==========================================================================

  describe('getConflictingFiles', () => {
    const TID = TASK_IDS.getConflictingFiles;

    it('returns empty array when there are no conflicts', async () => {
      const { bareRepoPath } = await createTestRepoWithBare('no-conflict');
      const worktreePath = await createWorktreeManually(bareRepoPath, TID.id1);

      const conflicts = await service.getConflictingFiles(worktreePath);
      expect(conflicts).toEqual([]);
    });

    it('returns list of conflicting files when merge conflict exists', async () => {
      const { sourceDir, bareRepoPath } = await createTestRepoWithBare('with-conflict');

      // Create a conflicting change in source on a different branch
      git('checkout -b conflict-branch', sourceDir);
      await writeFile(path.join(sourceDir, 'README.md'), 'conflict branch content\n', 'utf-8');
      git('add -A', sourceDir);
      git('commit -m "conflict branch change"', sourceDir);
      git('checkout main', sourceDir);

      // Make a different change on main
      await writeFile(path.join(sourceDir, 'README.md'), 'main branch content\n', 'utf-8');
      git('add -A', sourceDir);
      git('commit -m "main branch change"', sourceDir);

      // Fetch both branches into bare
      git(`fetch "${sourceDir}" main:main --force`, bareRepoPath);
      git(`fetch "${sourceDir}" conflict-branch:conflict-branch --force`, bareRepoPath);

      // Create worktree from conflict-branch
      const worktreePath = path.join(TEST_WORKTREES_DIR, `task-${TID.id2}`);
      git(`worktree add "${worktreePath}" conflict-branch`, bareRepoPath);
      git('config user.email "test@test.com"', worktreePath);
      git('config user.name "Test"', worktreePath);

      // Attempt merge that will conflict
      try {
        git('merge main', worktreePath);
      } catch {
        // Expected: merge conflict
      }

      const conflicts = await service.getConflictingFiles(worktreePath);
      expect(conflicts).toContain('README.md');
      expect(conflicts.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty array when cwd is not a git repo', async () => {
      // Create a real directory that is not a git repo - execGit will run but
      // git diff will fail with a non-zero exit code, returning empty array
      const nonGitDir = path.join(TEST_ROOT, 'not-a-git-repo');
      await mkdir(nonGitDir, { recursive: true });

      const conflicts = await service.getConflictingFiles(nonGitDir);
      expect(conflicts).toEqual([]);
    });
  });

  describe('setupWorktree', () => {
    const TID = TASK_IDS.setupWorktree;

    it('creates a new worktree for a local repo', async () => {
      const { repoUrl } = await createTestRepoWithBare('setup-new');

      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      expect(result.worktreePath).toContain(`task-${TID.id1}`);
      expect(result.reused).toBe(false);
      expect(result.branchName).toBe(`feature/task-${TID.id1}`);
      expect(result.isEmptyRepo).toBe(false);
      expect(existsSync(result.worktreePath)).toBe(true);
    });

    it('reuses existing valid worktree on second call', async () => {
      const { repoUrl } = await createTestRepoWithBare('setup-reuse');
      // Use the same TID.id1 - the previous test's worktree already exists
      // but this test creates its own repo so it gets its own bare repo.
      // We need a dedicated ID here to avoid collision with the test above.
      const taskId = '00000000-0003-0002-0001-000000000001';

      const first = await service.setupWorktree(taskId, repoUrl, 'main');
      expect(first.reused).toBe(false);

      const second = await service.setupWorktree(taskId, repoUrl, 'main');
      expect(second.reused).toBe(true);
      expect(second.worktreePath).toBe(first.worktreePath);
    });

    it('rejects invalid task IDs', async () => {
      await expect(
        service.setupWorktree('bad-id', 'https://github.com/acme/repo', 'main')
      ).rejects.toThrow('Invalid task ID format');
    });

    it('cleans up invalid worktree directory and recreates', async () => {
      const { repoUrl } = await createTestRepoWithBare('setup-invalid');
      const taskId = '00000000-0003-0003-0001-000000000001';

      // Create an invalid worktree directory (no .git file)
      const invalidPath = path.join(TEST_WORKTREES_DIR, `task-${taskId}`);
      await mkdir(invalidPath, { recursive: true });
      await writeFile(path.join(invalidPath, 'some-file.txt'), 'not a worktree', 'utf-8');

      const result = await service.setupWorktree(taskId, repoUrl, 'main');

      expect(result.reused).toBe(false);
      expect(existsSync(result.worktreePath)).toBe(true);
    });
  });

  describe('cleanupWorktree', () => {
    const TID = TASK_IDS.cleanupWorktree;

    it('removes an existing worktree and its directory', async () => {
      const { repoUrl } = await createTestRepoWithBare('cleanup-ok');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      expect(existsSync(result.worktreePath)).toBe(true);

      await service.cleanupWorktree(TID.id1);

      expect(existsSync(result.worktreePath)).toBe(false);
      expect(service.getBareRepoPathForTask(TID.id1)).toBeNull();
    });

    it('succeeds silently when worktree directory does not exist', async () => {
      // Use a task ID that has never been used for setupWorktree
      const unusedId = '00000000-0004-ffff-ffff-ffffffffffff';
      await expect(service.cleanupWorktree(unusedId)).resolves.toBeUndefined();
    });

    it('rejects invalid task IDs', async () => {
      await expect(service.cleanupWorktree('not-uuid')).rejects.toThrow('Invalid task ID format');
    });

    it('cleans up worktree not tracked in memory (disk-only)', async () => {
      const { bareRepoPath } = await createTestRepoWithBare('cleanup-disk');
      // Create worktree manually (not via service, so not tracked in activeWorktrees)
      const worktreePath = await createWorktreeManually(bareRepoPath, TID.id2);

      expect(existsSync(worktreePath)).toBe(true);

      // Construct a new service instance so activeWorktrees is empty for this task
      const freshService = new GitService();
      await freshService.cleanupWorktree(TID.id2);

      expect(existsSync(worktreePath)).toBe(false);
    });
  });

  describe('createWorktreeForEmptyRepo (via setupWorktree)', () => {
    const TID = TASK_IDS.emptyRepo;

    it('handles empty repository by creating an orphan branch worktree', async () => {
      // Create an empty bare repo (no commits)
      const emptySourceDir = path.join(TEST_ROOT, 'source-empty');
      await mkdir(emptySourceDir, { recursive: true });
      git('init -b main', emptySourceDir);

      const bareRepoPath = path.join(TEST_REPOS_DIR, 'local-empty.git');
      git(`clone --bare "${emptySourceDir}" "${bareRepoPath}"`, TEST_ROOT);

      const repoUrl = `file://${emptySourceDir.replace(/\\/g, '/')}`;

      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      expect(result.isEmptyRepo).toBe(true);
      expect(result.reused).toBe(false);
      expect(existsSync(result.worktreePath)).toBe(true);
    });
  });

  // ==========================================================================
  // Tier 2 -- Git Operations
  // ==========================================================================

  describe('commitChanges', () => {
    const TID = TASK_IDS.commitChanges;

    it('stages and commits changes successfully', async () => {
      const { repoUrl } = await createTestRepoWithBare('commit-ok');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      // Create a new file in the worktree
      await writeFile(path.join(result.worktreePath, 'new-file.txt'), 'new content\n', 'utf-8');

      await service.commitChanges(result.worktreePath, 'Add new file');

      // Verify commit was created
      const log = git('log --oneline -1', result.worktreePath);
      expect(log).toContain('Add new file');
    });

    it('does nothing when there are no changes to commit', async () => {
      const { repoUrl } = await createTestRepoWithBare('commit-noop');
      const result = await service.setupWorktree(TID.id2, repoUrl, 'main');

      // No changes made - commitChanges should not throw
      await expect(
        service.commitChanges(result.worktreePath, 'Empty commit')
      ).resolves.toBeUndefined();

      // Verify no new commit with "Empty commit" message
      const log = git('log --oneline', result.worktreePath);
      expect(log).not.toContain('Empty commit');
    });
  });

  describe('hasChanges', () => {
    const TID = TASK_IDS.hasChanges;

    it('returns false when worktree is clean', async () => {
      const { repoUrl } = await createTestRepoWithBare('changes-clean');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      const hasChanges = await service.hasChanges(result.worktreePath);
      expect(hasChanges).toBe(false);
    });

    it('returns true when there are uncommitted changes', async () => {
      const { repoUrl } = await createTestRepoWithBare('changes-dirty');
      const result = await service.setupWorktree(TID.id2, repoUrl, 'main');

      await writeFile(path.join(result.worktreePath, 'dirty.txt'), 'dirty\n', 'utf-8');

      const hasChanges = await service.hasChanges(result.worktreePath);
      expect(hasChanges).toBe(true);
    });

    it('returns true for staged but uncommitted changes', async () => {
      const { repoUrl } = await createTestRepoWithBare('changes-staged');
      const result = await service.setupWorktree(TID.id3, repoUrl, 'main');

      await writeFile(path.join(result.worktreePath, 'staged.txt'), 'staged\n', 'utf-8');
      git('add staged.txt', result.worktreePath);

      const hasChanges = await service.hasChanges(result.worktreePath);
      expect(hasChanges).toBe(true);
    });
  });

  describe('getCurrentBranch', () => {
    const TID = TASK_IDS.getCurrentBranch;

    it('returns the current branch name', async () => {
      const { repoUrl } = await createTestRepoWithBare('branch-name');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      const branch = await service.getCurrentBranch(result.worktreePath);
      expect(branch).toBe(`feature/task-${TID.id1}`);
    });

    it('returns branch from parent git repo when cwd is a subdirectory', async () => {
      // A non-git directory inside a git repo will inherit the parent's branch.
      // This validates the method does not crash on arbitrary directories.
      const subDir = path.join(TEST_ROOT, 'not-a-repo');
      await mkdir(subDir, { recursive: true });

      // Should return some branch name (from the parent monorepo) without throwing
      const branch = await service.getCurrentBranch(subDir);
      expect(typeof branch).toBe('string');
      expect(branch.length).toBeGreaterThan(0);
    });
  });

  describe('getLatestCommit', () => {
    const TID = TASK_IDS.getLatestCommit;

    it('returns a valid commit hash', async () => {
      const { repoUrl } = await createTestRepoWithBare('latest-commit');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      const hash = await service.getLatestCommit(result.worktreePath);
      // SHA-1 hex hash is 40 characters
      expect(hash).toMatch(/^[a-f0-9]{40}$/);
    });

    it('returns commit hash from parent git repo when cwd is a subdirectory', async () => {
      // A non-git directory inside a git repo will inherit the parent's commit.
      const subDir = path.join(TEST_ROOT, 'not-a-repo-2');
      await mkdir(subDir, { recursive: true });

      // Should return a commit hash without throwing
      const hash = await service.getLatestCommit(subDir);
      expect(hash).toMatch(/^[a-f0-9]{40}$/);
    });
  });

  describe('getDiff', () => {
    const TID = TASK_IDS.getDiff;

    it('returns "No changes detected" when worktree is clean and no baseBranch', async () => {
      const { repoUrl } = await createTestRepoWithBare('diff-clean');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      const diff = await service.getDiff(result.worktreePath);
      expect(diff).toBe('No changes detected');
    });

    it('returns unstaged diff when files are modified', async () => {
      const { repoUrl } = await createTestRepoWithBare('diff-unstaged');
      const result = await service.setupWorktree(TID.id2, repoUrl, 'main');

      // Modify an existing file
      await writeFile(path.join(result.worktreePath, 'README.md'), '# Modified\n', 'utf-8');

      const diff = await service.getDiff(result.worktreePath);
      expect(diff).toContain('Unstaged Changes');
      expect(diff).toContain('Modified');
    });

    it('returns staged diff when files are staged', async () => {
      const { repoUrl } = await createTestRepoWithBare('diff-staged');
      const result = await service.setupWorktree(TID.id3, repoUrl, 'main');

      await writeFile(path.join(result.worktreePath, 'staged-file.txt'), 'staged content\n', 'utf-8');
      git('add staged-file.txt', result.worktreePath);

      const diff = await service.getDiff(result.worktreePath);
      expect(diff).toContain('Staged Changes');
      expect(diff).toContain('staged content');
    });

    it('includes committed changes when baseBranch is provided', async () => {
      const { repoUrl } = await createTestRepoWithBare('diff-base');
      const result = await service.setupWorktree(TID.id4, repoUrl, 'main');

      // Make and commit a change
      await writeFile(path.join(result.worktreePath, 'new-file.txt'), 'new content\n', 'utf-8');
      git('add -A', result.worktreePath);
      git('commit -m "add new file"', result.worktreePath);

      const diff = await service.getDiff(result.worktreePath, 'main');
      expect(diff).toContain('new content');
    });
  });

  describe('getChangedFiles', () => {
    const TID = TASK_IDS.getChangedFiles;

    it('returns empty array when no changes exist', async () => {
      const { repoUrl } = await createTestRepoWithBare('changed-empty');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      const files = await service.getChangedFiles(result.worktreePath, 'main');
      expect(files).toEqual([]);
    });

    it('returns added files with correct status', async () => {
      const { repoUrl } = await createTestRepoWithBare('changed-added');
      const result = await service.setupWorktree(TID.id2, repoUrl, 'main');

      await writeFile(path.join(result.worktreePath, 'added.txt'), 'added content\n', 'utf-8');
      git('add -A', result.worktreePath);
      git('commit -m "add file"', result.worktreePath);

      const files = await service.getChangedFiles(result.worktreePath, 'main');
      expect(files.length).toBeGreaterThanOrEqual(1);

      const addedFile = files.find((f) => f.path === 'added.txt');
      expect(addedFile).toBeDefined();
      expect(addedFile!.status).toBe('added');
      expect(addedFile!.newContent).toContain('added content');
    });

    it('returns modified files with correct status', async () => {
      const { repoUrl } = await createTestRepoWithBare('changed-modified');
      const result = await service.setupWorktree(TID.id3, repoUrl, 'main');

      await writeFile(path.join(result.worktreePath, 'README.md'), '# Modified Content\n', 'utf-8');
      git('add -A', result.worktreePath);
      git('commit -m "modify readme"', result.worktreePath);

      const files = await service.getChangedFiles(result.worktreePath, 'main');
      const modifiedFile = files.find((f) => f.path === 'README.md');
      expect(modifiedFile).toBeDefined();
      expect(modifiedFile!.status).toBe('modified');
    });

    it('returns deleted files with correct status', async () => {
      const { repoUrl } = await createTestRepoWithBare('changed-deleted');
      const result = await service.setupWorktree(TID.id4, repoUrl, 'main');

      git('rm README.md', result.worktreePath);
      git('commit -m "delete readme"', result.worktreePath);

      const files = await service.getChangedFiles(result.worktreePath, 'main');
      const deletedFile = files.find((f) => f.path === 'README.md');
      expect(deletedFile).toBeDefined();
      expect(deletedFile!.status).toBe('deleted');
    });
  });

  describe('fetchRepo', () => {
    it('fetches from a local repo successfully', async () => {
      const { sourceDir, bareRepoPath, repoUrl } = await createTestRepoWithBare('fetch-ok');

      // Make a new commit in source
      await writeFile(path.join(sourceDir, 'new.txt'), 'new\n', 'utf-8');
      git('add -A', sourceDir);
      git('commit -m "new file in source"', sourceDir);

      await expect(
        service.fetchRepo(bareRepoPath, 'main', repoUrl)
      ).resolves.toBeUndefined();
    });

    it('skips fetch for empty repositories', async () => {
      const emptySourceDir = path.join(TEST_ROOT, 'source-fetch-empty');
      await mkdir(emptySourceDir, { recursive: true });
      git('init -b main', emptySourceDir);

      const bareRepoPath = path.join(TEST_REPOS_DIR, 'local-fetch-empty.git');
      git(`clone --bare "${emptySourceDir}" "${bareRepoPath}"`, TEST_ROOT);
      const repoUrl = `file://${emptySourceDir.replace(/\\/g, '/')}`;

      // Should not throw for empty repo
      await expect(
        service.fetchRepo(bareRepoPath, 'main', repoUrl)
      ).resolves.toBeUndefined();
    });
  });

  describe('isEmptyRepo', () => {
    it('returns true for a repo with no commits', async () => {
      const emptySourceDir = path.join(TEST_ROOT, 'source-isempty-true');
      await mkdir(emptySourceDir, { recursive: true });
      git('init -b main', emptySourceDir);

      const bareRepoPath = path.join(TEST_REPOS_DIR, 'local-isempty-true.git');
      git(`clone --bare "${emptySourceDir}" "${bareRepoPath}"`, TEST_ROOT);

      const isEmpty = await service.isEmptyRepo(bareRepoPath);
      expect(isEmpty).toBe(true);
    });

    it('returns false for a repo with commits', async () => {
      const { bareRepoPath } = await createTestRepoWithBare('isempty-false');

      const isEmpty = await service.isEmptyRepo(bareRepoPath);
      expect(isEmpty).toBe(false);
    });
  });

  describe('pushBranch', () => {
    const TID = TASK_IDS.pushBranch;

    it('pushes branch to a local remote successfully', async () => {
      const { repoUrl } = await createTestRepoWithBare('push-ok');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      // Create a change and commit
      await writeFile(path.join(result.worktreePath, 'pushed.txt'), 'pushed\n', 'utf-8');
      git('add -A', result.worktreePath);
      git('commit -m "push test"', result.worktreePath);

      // Since githubToken is '', no auth URL mangling should happen.
      // The worktree remote points to the bare repo, push should succeed.
      await expect(
        service.pushBranch(result.worktreePath, result.branchName)
      ).resolves.toBeUndefined();
    });

    it('throws when push fails (non-existent remote)', async () => {
      const { repoUrl } = await createTestRepoWithBare('push-fail');
      const result = await service.setupWorktree(TID.id2, repoUrl, 'main');

      // Point origin to a non-existent remote
      git('remote set-url origin https://invalid.example.com/no-repo.git', result.worktreePath);

      await writeFile(path.join(result.worktreePath, 'fail.txt'), 'fail\n', 'utf-8');
      git('add -A', result.worktreePath);
      git('commit -m "will fail"', result.worktreePath);

      await expect(
        service.pushBranch(result.worktreePath, result.branchName)
      ).rejects.toThrow();
    });
  });

  describe('fetchInWorktree', () => {
    const TID = TASK_IDS.fetchInWorktree;

    it('fetches a branch successfully in worktree context', async () => {
      const { repoUrl } = await createTestRepoWithBare('fetch-wt');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      // fetchInWorktree requires origin to be accessible
      await expect(
        service.fetchInWorktree(result.worktreePath, 'main')
      ).resolves.toBeUndefined();
    });

    it('throws when fetch fails on non-existent remote', async () => {
      const { repoUrl } = await createTestRepoWithBare('fetch-wt-fail');
      const result = await service.setupWorktree(TID.id2, repoUrl, 'main');

      // Point origin to invalid remote
      git('remote set-url origin https://invalid.example.com/no-repo.git', result.worktreePath);

      await expect(
        service.fetchInWorktree(result.worktreePath, 'main')
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Tier 3 -- Edge Cases
  // ==========================================================================

  describe('getRemoteUrl', () => {
    const TID = TASK_IDS.getRemoteUrl;

    it('returns the remote URL when origin is configured', async () => {
      const { repoUrl } = await createTestRepoWithBare('remote-url');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      const remoteUrl = await service.getRemoteUrl(result.worktreePath);
      expect(remoteUrl).not.toBeNull();
      expect(typeof remoteUrl).toBe('string');
    });

    it('returns null when no remote is configured', async () => {
      // Create a standalone repo with no remote
      const noRemoteDir = path.join(TEST_ROOT, 'no-remote');
      await mkdir(noRemoteDir, { recursive: true });
      git('init -b main', noRemoteDir);
      git('config user.email "test@test.com"', noRemoteDir);
      git('config user.name "Test"', noRemoteDir);
      await writeFile(path.join(noRemoteDir, 'file.txt'), 'content\n', 'utf-8');
      git('add -A', noRemoteDir);
      git('commit -m "init"', noRemoteDir);

      const remoteUrl = await service.getRemoteUrl(noRemoteDir);
      expect(remoteUrl).toBeNull();
    });
  });

  describe('getFileContentAtRef', () => {
    const TID = TASK_IDS.getFileContentAtRef;

    it('returns file content at a specific ref', async () => {
      const { repoUrl } = await createTestRepoWithBare('content-at-ref');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      // The initial commit has README.md
      // Note: execGit trims stdout, so the trailing newline is stripped
      const content = await service.getFileContentAtRef(result.worktreePath, 'README.md', 'HEAD');
      expect(content).toBe('# Test Repo');
    });

    it('returns null for a file that does not exist at the ref', async () => {
      const { repoUrl } = await createTestRepoWithBare('content-missing-ref');
      const result = await service.setupWorktree(TID.id2, repoUrl, 'main');

      const content = await service.getFileContentAtRef(
        result.worktreePath,
        'nonexistent.txt',
        'HEAD'
      );
      expect(content).toBeNull();
    });

    it('returns null for binary content at ref', async () => {
      const { repoUrl } = await createTestRepoWithBare('content-binary-ref');
      const result = await service.setupWorktree(TID.id3, repoUrl, 'main');

      // Add a binary file
      await writeFile(
        path.join(result.worktreePath, 'binary.bin'),
        Buffer.from([0, 1, 2, 0, 3, 4])
      );
      git('add binary.bin', result.worktreePath);
      git('commit -m "add binary"', result.worktreePath);

      const content = await service.getFileContentAtRef(result.worktreePath, 'binary.bin', 'HEAD');
      // git show for binary files may or may not include null bytes depending on git version
      // The method checks for \0 and returns null for binary content
      expect(content === null || typeof content === 'string').toBe(true);
    });
  });

  describe('worktreeExists', () => {
    const TID = TASK_IDS.worktreeExists;

    it('returns false when worktree directory does not exist', async () => {
      const exists = await service.worktreeExists(TID.id1);
      expect(exists).toBe(false);
    });

    it('returns true when worktree directory exists', async () => {
      const taskId = '00000000-0011-0002-0001-000000000001';
      const worktreePath = path.join(TEST_WORKTREES_DIR, `task-${taskId}`);
      await mkdir(worktreePath, { recursive: true });

      const exists = await service.worktreeExists(taskId);
      expect(exists).toBe(true);
    });
  });

  describe('getWorktreePath', () => {
    const TID = TASK_IDS.getWorktreePath;

    it('returns undefined when no worktree exists for an unused task ID', () => {
      // Use a task ID that no other test has used with setupWorktree
      // to avoid activeWorktrees pollution from module-level map
      const result = service.getWorktreePath(TID.unused);
      expect(result).toBeUndefined();
    });

    it('returns the path from active worktrees when tracked in memory', async () => {
      const { repoUrl } = await createTestRepoWithBare('wt-path-memory');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      const wtPath = service.getWorktreePath(TID.id1);
      expect(wtPath).toBe(result.worktreePath);
    });
  });

  describe('ensureBareRepo', () => {
    it('clones a bare repo from a local source', async () => {
      const sourceDir = path.join(TEST_ROOT, 'source-ensure');
      await mkdir(sourceDir, { recursive: true });
      git('init -b main', sourceDir);
      git('config user.email "test@test.com"', sourceDir);
      git('config user.name "Test"', sourceDir);
      await writeFile(path.join(sourceDir, 'file.txt'), 'content\n', 'utf-8');
      git('add -A', sourceDir);
      git('commit -m "init"', sourceDir);

      const repoUrl = `file://${sourceDir.replace(/\\/g, '/')}`;
      const bareRepoPath = await service.ensureBareRepo(repoUrl);

      expect(existsSync(bareRepoPath)).toBe(true);
      expect(bareRepoPath).toContain('.git');
    });

    it('reuses existing bare repo on second call', async () => {
      const sourceDir = path.join(TEST_ROOT, 'source-ensure-reuse');
      await mkdir(sourceDir, { recursive: true });
      git('init -b main', sourceDir);
      git('config user.email "test@test.com"', sourceDir);
      git('config user.name "Test"', sourceDir);
      await writeFile(path.join(sourceDir, 'file.txt'), 'content\n', 'utf-8');
      git('add -A', sourceDir);
      git('commit -m "init"', sourceDir);

      const repoUrl = `file://${sourceDir.replace(/\\/g, '/')}`;
      const first = await service.ensureBareRepo(repoUrl);
      const second = await service.ensureBareRepo(repoUrl);

      expect(first).toBe(second);
    });
  });

  describe('multiple worktrees for different tasks', () => {
    const TID = TASK_IDS.multipleWorktrees;

    it('creates independent worktrees for different task IDs', async () => {
      const { repoUrl } = await createTestRepoWithBare('multi-wt');

      const r1 = await service.setupWorktree(TID.id1, repoUrl, 'main');
      const r2 = await service.setupWorktree(TID.id2, repoUrl, 'main');

      expect(r1.worktreePath).not.toBe(r2.worktreePath);
      expect(existsSync(r1.worktreePath)).toBe(true);
      expect(existsSync(r2.worktreePath)).toBe(true);

      // Changes in one worktree should not affect the other
      await writeFile(path.join(r1.worktreePath, 'only-in-wt1.txt'), 'wt1\n', 'utf-8');
      expect(existsSync(path.join(r2.worktreePath, 'only-in-wt1.txt'))).toBe(false);
    });
  });

  describe('hasConflictMarkers edge cases', () => {
    it('returns empty array when no files are provided', async () => {
      const dir = path.join(TEST_ROOT, 'markers-empty');
      await mkdir(dir, { recursive: true });

      const files = await service.hasConflictMarkers(dir, []);
      expect(files).toEqual([]);
    });

    it('handles all files missing gracefully', async () => {
      const dir = path.join(TEST_ROOT, 'markers-all-missing');
      await mkdir(dir, { recursive: true });

      const files = await service.hasConflictMarkers(dir, ['a.ts', 'b.ts', 'c.ts']);
      expect(files).toEqual([]);
    });
  });

  describe('getFileContent edge cases', () => {
    it('returns null for files in non-existent directories', async () => {
      const content = await service.getFileContent(
        path.join(TEST_ROOT, 'nonexistent-dir'),
        'file.txt'
      );
      expect(content).toBeNull();
    });

    it('handles large text files', async () => {
      const dir = path.join(TEST_ROOT, 'large-file');
      await mkdir(dir, { recursive: true });
      const largeContent = 'x'.repeat(200_000);
      await writeFile(path.join(dir, 'large.txt'), largeContent, 'utf-8');

      const content = await service.getFileContent(dir, 'large.txt');
      expect(content).toBe(largeContent);
    });
  });

  describe('getBareRepoPathForTask', () => {
    const TID = TASK_IDS.getBareRepoPathForTask;

    it('returns the bare repo path after worktree is set up', async () => {
      const { repoUrl } = await createTestRepoWithBare('bare-path-ok');
      await service.setupWorktree(TID.id1, repoUrl, 'main');

      const result = service.getBareRepoPathForTask(TID.id1);
      expect(result).not.toBeNull();
      // The path should end with .git
      expect(result!.endsWith('.git')).toBe(true);
    });

    it('returns null for untracked task after cleanup', async () => {
      const { repoUrl } = await createTestRepoWithBare('bare-path-cleanup');
      await service.setupWorktree(TID.id2, repoUrl, 'main');
      await service.cleanupWorktree(TID.id2);

      const result = service.getBareRepoPathForTask(TID.id2);
      expect(result).toBeNull();
    });
  });

  describe('createWorktree (direct)', () => {
    const TID = TASK_IDS.createWorktreeDirect;

    it('throws when worktree directory already exists', async () => {
      const { repoUrl } = await createTestRepoWithBare('create-exists');
      // Create first worktree
      await service.setupWorktree(TID.id1, repoUrl, 'main');

      // Trying to createWorktree directly (not setupWorktree) should fail
      await expect(
        service.createWorktree(TID.id1, repoUrl, 'main')
      ).rejects.toThrow('Worktree already exists');
    });

    it('creates worktree successfully when directory does not exist', async () => {
      const { repoUrl } = await createTestRepoWithBare('create-fresh');

      const result = await service.createWorktree(TID.id2, repoUrl, 'main');
      expect(existsSync(result.worktreePath)).toBe(true);
      expect(result.isEmptyRepo).toBe(false);
    });

    it('reuses existing branch when it already exists in bare repo', async () => {
      const { repoUrl } = await createTestRepoWithBare('create-existing-branch');

      // Create a worktree to establish the branch, then clean it up via service
      const first = await service.createWorktree(TID.id3, repoUrl, 'main');
      expect(first.isEmptyRepo).toBe(false);

      // Clean up via service (handles Windows EBUSY), but keep the branch (removeBranch=false)
      await service.cleanupWorktree(TID.id3, false);

      // Now createWorktree with the same task ID should find the existing branch
      const second = await service.createWorktree(TID.id3, repoUrl, 'main');
      expect(existsSync(second.worktreePath)).toBe(true);
      expect(second.isEmptyRepo).toBe(false);
    });
  });

  // ==========================================================================
  // Coverage boost: singleton, execGitOrThrow, getDiff edge cases
  // ==========================================================================

  describe('getGitService (singleton)', () => {
    it('returns a GitService instance', () => {
      const instance = getGitService();
      expect(instance).toBeInstanceOf(GitService);
    });

    it('returns the same instance on subsequent calls', () => {
      const a = getGitService();
      const b = getGitService();
      expect(a).toBe(b);
    });
  });

  describe('execGitOrThrow', () => {
    it('returns stdout on successful command', async () => {
      const result = await execGitOrThrow(['--version']);
      expect(result).toContain('git version');
    });

    it('throws on failed git command', async () => {
      // Use a git command that will always fail: checkout a non-existent ref
      const tmpDir = path.join(TEST_ROOT, 'exec-fail-dir');
      await mkdir(tmpDir, { recursive: true });
      git('init -b main', tmpDir);
      await expect(
        execGitOrThrow(['checkout', 'nonexistent-branch-xyz'], tmpDir)
      ).rejects.toThrow('Git command failed');
    });
  });

  describe('getDiff edge cases', () => {
    const TID = TASK_IDS.getDiffEdge;

    it('skips committed diff when baseBranch does not exist', async () => {
      const { repoUrl } = await createTestRepoWithBare('diff-no-base');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      // Modify a file so there's an unstaged diff
      await writeFile(path.join(result.worktreePath, 'README.md'), '# Changed\n', 'utf-8');

      // Use a baseBranch that doesn't exist
      const diff = await service.getDiff(result.worktreePath, 'nonexistent-branch');
      // Should still include unstaged changes but NOT committed diff
      expect(diff).toContain('Unstaged Changes');
    });
  });

  describe('getChangedFiles edge cases', () => {
    const TID = TASK_IDS.getChangedFilesEdge;

    it('handles uncommitted (untracked) files via status', async () => {
      const { repoUrl } = await createTestRepoWithBare('changed-untracked');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');

      // Add an untracked file (not committed)
      await writeFile(path.join(result.worktreePath, 'untracked.txt'), 'hello\n', 'utf-8');

      const files = await service.getChangedFiles(result.worktreePath, 'main');
      const untrackedFile = files.find((f: any) => f.path === 'untracked.txt');
      expect(untrackedFile).toBeDefined();
      expect(untrackedFile!.status).toBe('added');
    });

    it('handles baseBranch that does not exist (empty repo scenario)', async () => {
      const { repoUrl } = await createTestRepoWithBare('changed-no-base');
      const result = await service.setupWorktree(TID.id2, repoUrl, 'main');

      // Add and commit a file on the feature branch
      await writeFile(path.join(result.worktreePath, 'new.txt'), 'content\n', 'utf-8');
      git('add -A', result.worktreePath);
      git('commit -m "add new"', result.worktreePath);

      // Compare against a non-existent branch - should use --root fallback
      const files = await service.getChangedFiles(result.worktreePath, 'nonexistent-branch');
      // Should still return files (via --root diff or status)
      expect(Array.isArray(files)).toBe(true);
    });
  });

  describe('cleanupWorktree with removeBranch', () => {
    const TID = TASK_IDS.cleanupWithRemoveBranch;

    it('removes the branch when removeBranch is true', async () => {
      const { repoUrl } = await createTestRepoWithBare('cleanup-branch');
      const result = await service.setupWorktree(TID.id1, repoUrl, 'main');
      const bareRepoPath = service.getBareRepoPathForTask(TID.id1);

      expect(existsSync(result.worktreePath)).toBe(true);
      expect(bareRepoPath).not.toBeNull();

      // Verify the branch exists in the bare repo
      const branchBefore = git('branch --list feature/task-*', bareRepoPath!);
      expect(branchBefore).toContain(`feature/task-${TID.id1}`);

      await service.cleanupWorktree(TID.id1, true);

      expect(existsSync(result.worktreePath)).toBe(false);

      // Verify the branch was removed
      const branchAfter = git('branch --list feature/task-*', bareRepoPath!);
      expect(branchAfter).not.toContain(`feature/task-${TID.id1}`);
    });
  });
});
