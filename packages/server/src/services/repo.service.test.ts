import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetectedStack } from './stack-detector.service.js';

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const mockExecResults = vi.hoisted(() => ({
  results: [] as Array<{ columns: string[]; values: unknown[][] }>,
}));

const mockDb = vi.hoisted(() => ({
  exec: vi.fn((_sql: string, _params: unknown[] = []) => {
    return mockExecResults.results;
  }),
}));

const mockStackDetector = vi.hoisted(() => ({
  detectStack: vi.fn(),
}));

vi.mock('../db/database.js', () => ({
  getDatabase: () => mockDb,
  saveDatabase: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('./stack-detector.service.js', () => ({
  createStackDetector: () => mockStackDetector,
  DEFAULT_DETECTED_STACK: {
    framework: null,
    state_management: null,
    styling: null,
    testing: null,
  },
}));

// ── Import after mocks are set up ──────────────────────────────────────────

import { RepoService, getRepoService } from './repo.service.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_STACK: DetectedStack = {
  framework: null,
  state_management: null,
  styling: null,
  testing: null,
};

const REACT_STACK: DetectedStack = {
  framework: 'React',
  state_management: 'Zustand',
  styling: 'Tailwind CSS',
  testing: 'Vitest',
};

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'acme/repo',
    url: 'https://github.com/acme/repo',
    default_branch: 'main',
    ...overrides,
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe('RepoService', () => {
  let service: RepoService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset DB mock to return empty task counts by default
    mockExecResults.results = [];
    // Always create a fresh service to avoid inter-test contamination
    service = new RepoService();
  });

  // ────────────────────────────────────────────────────────────────────────
  // createRepository
  // ────────────────────────────────────────────────────────────────────────

  describe('createRepository', () => {
    it('creates a repository without github token and assigns default stack', async () => {
      const repo = await service.createRepository(makeInput());

      expect(repo.id).toBeDefined();
      expect(repo.name).toBe('acme/repo');
      expect(repo.url).toBe('https://github.com/acme/repo');
      expect(repo.default_branch).toBe('main');
      expect(repo.detected_stack).toEqual(DEFAULT_STACK);
      expect(repo.conventions).toBe('');
      expect(repo.learned_patterns).toEqual([]);
      expect(repo.active_tasks_count).toBe(0);
      expect(repo.created_at).toBeDefined();
      expect(repo.updated_at).toBeDefined();
    });

    it('creates a repository with github token and detects stack', async () => {
      mockStackDetector.detectStack.mockResolvedValueOnce({
        detected_stack: REACT_STACK,
      });

      const repo = await service.createRepository(makeInput(), 'ghp_test_token');

      expect(mockStackDetector.detectStack).toHaveBeenCalledWith('acme', 'repo', 'main');
      expect(repo.detected_stack).toEqual(REACT_STACK);
    });

    it('falls back to default stack when detection fails with token', async () => {
      mockStackDetector.detectStack.mockRejectedValueOnce(new Error('GitHub API error'));

      const repo = await service.createRepository(makeInput(), 'ghp_test_token');

      expect(repo.detected_stack).toEqual(DEFAULT_STACK);
    });

    it('skips stack detection when repo name does not contain a slash', async () => {
      const repo = await service.createRepository(
        makeInput({ name: 'no-slash-name' }),
        'ghp_test_token',
      );

      expect(mockStackDetector.detectStack).not.toHaveBeenCalled();
      expect(repo.detected_stack).toEqual(DEFAULT_STACK);
    });

    it('returns a copy of the repository (not a reference)', async () => {
      const repo = await service.createRepository(makeInput());
      repo.name = 'mutated';

      const fetched = await service.getRepositoryById(repo.id);
      expect(fetched?.name).toBe('acme/repo');
    });

    it('assigns unique ids to different repositories', async () => {
      const r1 = await service.createRepository(makeInput({ name: 'acme/one' }));
      const r2 = await service.createRepository(makeInput({ name: 'acme/two' }));

      expect(r1.id).not.toBe(r2.id);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // createRepositoryWithStack
  // ────────────────────────────────────────────────────────────────────────

  describe('createRepositoryWithStack', () => {
    it('creates a repository with a pre-computed stack', async () => {
      const repo = await service.createRepositoryWithStack(makeInput(), REACT_STACK);

      expect(repo.detected_stack).toEqual(REACT_STACK);
      expect(repo.name).toBe('acme/repo');
      expect(repo.conventions).toBe('');
      expect(repo.learned_patterns).toEqual([]);
    });

    it('does not call the stack detector', async () => {
      await service.createRepositoryWithStack(makeInput(), REACT_STACK);

      expect(mockStackDetector.detectStack).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getRepositories
  // ────────────────────────────────────────────────────────────────────────

  describe('getRepositories', () => {
    it('returns an empty array when no repos exist', async () => {
      const repos = await service.getRepositories();
      expect(repos).toEqual([]);
    });

    it('returns all repositories sorted by created_at descending', async () => {
      const r1 = await service.createRepository(makeInput({ name: 'acme/first' }));

      // Wait enough to guarantee a distinct ISO timestamp
      await new Promise((r) => setTimeout(r, 15));

      const r2 = await service.createRepository(makeInput({ name: 'acme/second' }));

      // Ensure timestamps are actually different
      expect(r1.created_at).not.toBe(r2.created_at);

      const repos = await service.getRepositories();

      expect(repos).toHaveLength(2);
      // Most recent first
      expect(repos[0]?.id).toBe(r2.id);
      expect(repos[1]?.id).toBe(r1.id);
    });

    it('enriches repositories with active task counts from DB', async () => {
      const r1 = await service.createRepository(
        makeInput({ name: 'acme/one', url: 'https://github.com/acme/one' }),
      );
      await service.createRepository(
        makeInput({ name: 'acme/two', url: 'https://github.com/acme/two' }),
      );

      // Mock the GROUP BY query to return active task counts
      mockExecResults.results = [
        {
          columns: ['repo_url', 'count'],
          values: [['https://github.com/acme/one', 3]],
        },
      ];

      const repos = await service.getRepositories();

      const repoOne = repos.find((r) => r.id === r1.id);
      expect(repoOne?.active_tasks_count).toBe(3);
    });

    it('returns copies of repositories (not references)', async () => {
      await service.createRepository(makeInput());
      const repos = await service.getRepositories();
      repos[0]!.name = 'mutated';

      const freshRepos = await service.getRepositories();
      expect(freshRepos[0]?.name).toBe('acme/repo');
    });

    it('handles DB errors gracefully and defaults task counts to 0', async () => {
      await service.createRepository(makeInput());

      // Simulate DB error
      mockDb.exec.mockImplementationOnce(() => {
        throw new Error('DB not ready');
      });

      const repos = await service.getRepositories();
      expect(repos).toHaveLength(1);
      expect(repos[0]?.active_tasks_count).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getRepositoryById
  // ────────────────────────────────────────────────────────────────────────

  describe('getRepositoryById', () => {
    it('returns null for a non-existent id', async () => {
      const result = await service.getRepositoryById('missing-id');
      expect(result).toBeNull();
    });

    it('returns the repository when found', async () => {
      const created = await service.createRepository(makeInput());
      const found = await service.getRepositoryById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('acme/repo');
    });

    it('enriches the repository with active task count from DB', async () => {
      const created = await service.createRepository(makeInput());

      // Mock single-repo task count query
      mockExecResults.results = [
        {
          columns: ['count'],
          values: [[5]],
        },
      ];

      const found = await service.getRepositoryById(created.id);
      expect(found?.active_tasks_count).toBe(5);
    });

    it('returns a copy (not a reference) of the repository', async () => {
      const created = await service.createRepository(makeInput());
      const found = await service.getRepositoryById(created.id);
      found!.conventions = 'mutated';

      const again = await service.getRepositoryById(created.id);
      expect(again?.conventions).toBe('');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // updateRepository
  // ────────────────────────────────────────────────────────────────────────

  describe('updateRepository', () => {
    it('returns null when updating a non-existent repo', async () => {
      const result = await service.updateRepository('missing-id', { conventions: 'test' });
      expect(result).toBeNull();
    });

    it('updates the default_branch field', async () => {
      const created = await service.createRepository(makeInput());
      const updated = await service.updateRepository(created.id, { default_branch: 'develop' });

      expect(updated?.default_branch).toBe('develop');
    });

    it('updates the conventions field', async () => {
      const created = await service.createRepository(makeInput());
      const updated = await service.updateRepository(created.id, {
        conventions: 'Use TypeScript strict mode',
      });

      expect(updated?.conventions).toBe('Use TypeScript strict mode');
    });

    it('updates both fields simultaneously', async () => {
      const created = await service.createRepository(makeInput());
      const updated = await service.updateRepository(created.id, {
        default_branch: 'develop',
        conventions: 'ESLint + Prettier',
      });

      expect(updated?.default_branch).toBe('develop');
      expect(updated?.conventions).toBe('ESLint + Prettier');
    });

    it('changes the updated_at timestamp', async () => {
      const created = await service.createRepository(makeInput());
      const originalUpdatedAt = created.updated_at;

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 5));

      const updated = await service.updateRepository(created.id, {
        conventions: 'new convention',
      });

      expect(updated?.updated_at).not.toBe(originalUpdatedAt);
    });

    it('does not modify unspecified fields when updating', async () => {
      const created = await service.createRepository(makeInput());
      await service.updateRepository(created.id, { conventions: 'new' });

      const fetched = await service.getRepositoryById(created.id);
      expect(fetched?.default_branch).toBe('main');
      expect(fetched?.conventions).toBe('new');
    });

    it('does not modify fields when undefined is passed explicitly', async () => {
      const created = await service.createRepository(makeInput());
      const updated = await service.updateRepository(created.id, {
        default_branch: undefined,
        conventions: undefined,
      });

      // Fields stay unchanged (undefined means "don't modify")
      expect(updated?.default_branch).toBe('main');
      expect(updated?.conventions).toBe('');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // deleteRepository
  // ────────────────────────────────────────────────────────────────────────

  describe('deleteRepository', () => {
    it('returns false when deleting a non-existent repo', async () => {
      const result = await service.deleteRepository('missing-id');
      expect(result).toBe(false);
    });

    it('deletes an existing repository and returns true', async () => {
      const created = await service.createRepository(makeInput());
      const result = await service.deleteRepository(created.id);

      expect(result).toBe(true);
    });

    it('makes the repo unfindable after deletion', async () => {
      const created = await service.createRepository(makeInput());
      await service.deleteRepository(created.id);

      const fetched = await service.getRepositoryById(created.id);
      expect(fetched).toBeNull();
    });

    it('does not affect other repositories', async () => {
      const r1 = await service.createRepository(makeInput({ name: 'acme/one' }));
      const r2 = await service.createRepository(makeInput({ name: 'acme/two' }));

      await service.deleteRepository(r1.id);

      expect(await service.getRepositoryById(r2.id)).not.toBeNull();
    });

    it('returns false when deleting the same repo twice', async () => {
      const created = await service.createRepository(makeInput());
      await service.deleteRepository(created.id);
      const secondDelete = await service.deleteRepository(created.id);

      expect(secondDelete).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // detectStack
  // ────────────────────────────────────────────────────────────────────────

  describe('detectStack', () => {
    it('returns null when repo does not exist', async () => {
      const result = await service.detectStack('missing-id', 'ghp_token');
      expect(result).toBeNull();
    });

    it('re-detects stack for existing repo', async () => {
      const created = await service.createRepository(makeInput());

      mockStackDetector.detectStack.mockResolvedValueOnce({
        detected_stack: REACT_STACK,
      });

      const updated = await service.detectStack(created.id, 'ghp_token');

      expect(mockStackDetector.detectStack).toHaveBeenCalledWith('acme', 'repo', 'main');
      expect(updated?.detected_stack).toEqual(REACT_STACK);
    });

    it('updates the updated_at timestamp after re-detection', async () => {
      const created = await service.createRepository(makeInput());

      await new Promise((r) => setTimeout(r, 5));

      mockStackDetector.detectStack.mockResolvedValueOnce({
        detected_stack: REACT_STACK,
      });

      const updated = await service.detectStack(created.id, 'ghp_token');

      expect(updated?.updated_at).not.toBe(created.updated_at);
    });

    it('returns the repo unchanged when name has no slash', async () => {
      const created = await service.createRepository(
        makeInput({ name: 'no-slash' }),
      );

      const result = await service.detectStack(created.id, 'ghp_token');

      expect(mockStackDetector.detectStack).not.toHaveBeenCalled();
      expect(result?.name).toBe('no-slash');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // addLearnedPattern
  // ────────────────────────────────────────────────────────────────────────

  describe('addLearnedPattern', () => {
    it('returns null when repo does not exist', async () => {
      const result = await service.addLearnedPattern('missing-id', 'pattern', 'task-1');
      expect(result).toBeNull();
    });

    it('adds a learned pattern to a repository', async () => {
      const created = await service.createRepository(makeInput());

      const updated = await service.addLearnedPattern(
        created.id,
        'Always use const instead of let',
        'task-123',
      );

      expect(updated?.learned_patterns).toHaveLength(1);
      expect(updated?.learned_patterns[0]?.pattern).toBe('Always use const instead of let');
      expect(updated?.learned_patterns[0]?.learned_from_task_id).toBe('task-123');
      expect(updated?.learned_patterns[0]?.id).toBeDefined();
      expect(updated?.learned_patterns[0]?.created_at).toBeDefined();
    });

    it('can add multiple patterns', async () => {
      const created = await service.createRepository(makeInput());

      await service.addLearnedPattern(created.id, 'Pattern 1', 'task-1');
      const updated = await service.addLearnedPattern(created.id, 'Pattern 2', 'task-2');

      expect(updated?.learned_patterns).toHaveLength(2);
      expect(updated?.learned_patterns[0]?.pattern).toBe('Pattern 1');
      expect(updated?.learned_patterns[1]?.pattern).toBe('Pattern 2');
    });

    it('assigns unique ids to each pattern', async () => {
      const created = await service.createRepository(makeInput());

      await service.addLearnedPattern(created.id, 'Pattern 1', 'task-1');
      const updated = await service.addLearnedPattern(created.id, 'Pattern 2', 'task-2');

      const ids = updated!.learned_patterns.map((p) => p.id);
      expect(new Set(ids).size).toBe(2);
    });

    it('updates the updated_at timestamp', async () => {
      const created = await service.createRepository(makeInput());

      await new Promise((r) => setTimeout(r, 5));

      const updated = await service.addLearnedPattern(created.id, 'Pattern', 'task-1');
      expect(updated?.updated_at).not.toBe(created.updated_at);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // clearLearnedPatterns
  // ────────────────────────────────────────────────────────────────────────

  describe('clearLearnedPatterns', () => {
    it('returns success false when repo does not exist', async () => {
      const result = await service.clearLearnedPatterns('missing-id');
      expect(result).toEqual({ success: false, cleared_count: 0 });
    });

    it('clears all patterns and returns the count', async () => {
      const created = await service.createRepository(makeInput());
      await service.addLearnedPattern(created.id, 'P1', 'task-1');
      await service.addLearnedPattern(created.id, 'P2', 'task-2');
      await service.addLearnedPattern(created.id, 'P3', 'task-3');

      const result = await service.clearLearnedPatterns(created.id);

      expect(result).toEqual({ success: true, cleared_count: 3 });
    });

    it('leaves learned_patterns empty after clearing', async () => {
      const created = await service.createRepository(makeInput());
      await service.addLearnedPattern(created.id, 'P1', 'task-1');

      await service.clearLearnedPatterns(created.id);

      const fetched = await service.getRepositoryById(created.id);
      expect(fetched?.learned_patterns).toEqual([]);
    });

    it('returns cleared_count 0 when there are no patterns', async () => {
      const created = await service.createRepository(makeInput());
      const result = await service.clearLearnedPatterns(created.id);

      expect(result).toEqual({ success: true, cleared_count: 0 });
    });

    it('updates the updated_at timestamp', async () => {
      const created = await service.createRepository(makeInput());

      await new Promise((r) => setTimeout(r, 5));

      await service.clearLearnedPatterns(created.id);

      const fetched = await service.getRepositoryById(created.id);
      expect(fetched?.updated_at).not.toBe(created.updated_at);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // deleteLearnedPattern
  // ────────────────────────────────────────────────────────────────────────

  describe('deleteLearnedPattern', () => {
    it('returns repo not found when repo does not exist', async () => {
      const result = await service.deleteLearnedPattern('missing-id', 'pattern-id');
      expect(result).toEqual({ success: false, notFound: 'repo' });
    });

    it('returns pattern not found when pattern does not exist', async () => {
      const created = await service.createRepository(makeInput());
      const result = await service.deleteLearnedPattern(created.id, 'missing-pattern');
      expect(result).toEqual({ success: false, notFound: 'pattern' });
    });

    it('deletes a specific pattern by id', async () => {
      const created = await service.createRepository(makeInput());
      const withPattern = await service.addLearnedPattern(created.id, 'P1', 'task-1');
      const patternId = withPattern!.learned_patterns[0]!.id;

      const result = await service.deleteLearnedPattern(created.id, patternId);

      expect(result).toEqual({ success: true });

      const fetched = await service.getRepositoryById(created.id);
      expect(fetched?.learned_patterns).toHaveLength(0);
    });

    it('only removes the targeted pattern, leaving others intact', async () => {
      const created = await service.createRepository(makeInput());
      await service.addLearnedPattern(created.id, 'Keep this', 'task-1');
      const withTwo = await service.addLearnedPattern(created.id, 'Delete this', 'task-2');

      const deleteId = withTwo!.learned_patterns[1]!.id;
      await service.deleteLearnedPattern(created.id, deleteId);

      const fetched = await service.getRepositoryById(created.id);
      expect(fetched?.learned_patterns).toHaveLength(1);
      expect(fetched?.learned_patterns[0]?.pattern).toBe('Keep this');
    });

    it('updates the updated_at timestamp', async () => {
      const created = await service.createRepository(makeInput());
      const withPattern = await service.addLearnedPattern(created.id, 'P1', 'task-1');

      await new Promise((r) => setTimeout(r, 5));

      const patternId = withPattern!.learned_patterns[0]!.id;
      await service.deleteLearnedPattern(created.id, patternId);

      const fetched = await service.getRepositoryById(created.id);
      expect(fetched?.updated_at).not.toBe(withPattern?.updated_at);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getRepositoryByUrl
  // ────────────────────────────────────────────────────────────────────────

  describe('getRepositoryByUrl', () => {
    it('returns null when no repo matches the URL', async () => {
      const result = await service.getRepositoryByUrl('https://github.com/unknown/repo');
      expect(result).toBeNull();
    });

    it('finds a repository by its URL', async () => {
      const created = await service.createRepository(makeInput());
      const found = await service.getRepositoryByUrl('https://github.com/acme/repo');

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.url).toBe('https://github.com/acme/repo');
    });

    it('returns a copy (not a reference)', async () => {
      await service.createRepository(makeInput());
      const found = await service.getRepositoryByUrl('https://github.com/acme/repo');
      found!.name = 'mutated';

      const again = await service.getRepositoryByUrl('https://github.com/acme/repo');
      expect(again?.name).toBe('acme/repo');
    });

    it('returns null after the repo is deleted', async () => {
      const created = await service.createRepository(makeInput());
      await service.deleteRepository(created.id);

      const found = await service.getRepositoryByUrl('https://github.com/acme/repo');
      expect(found).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getRepoService (singleton factory)
  // ────────────────────────────────────────────────────────────────────────

  describe('getRepoService', () => {
    it('returns an instance of RepoService', () => {
      const instance = getRepoService();
      expect(instance).toBeInstanceOf(RepoService);
    });

    it('returns the same instance on subsequent calls', () => {
      const a = getRepoService();
      const b = getRepoService();
      expect(a).toBe(b);
    });
  });
});
