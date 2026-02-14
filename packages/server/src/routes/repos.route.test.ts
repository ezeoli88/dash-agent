import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const repoService = {
    getRepositories: vi.fn(),
    getRepositoryByUrl: vi.fn(),
    createRepository: vi.fn(),
    createRepositoryWithStack: vi.fn(),
    getRepositoryById: vi.fn(),
    updateRepository: vi.fn(),
    deleteRepository: vi.fn(),
    detectStack: vi.fn(),
    addLearnedPattern: vi.fn(),
    clearLearnedPatterns: vi.fn(),
    deleteLearnedPattern: vi.fn(),
  };

  const githubService = {
    listUserRepos: vi.fn(),
    searchRepos: vi.fn(),
    validateRepoUrl: vi.fn(),
  };

  const localScanService = {
    scanForRepos: vi.fn(),
  };

  const localStackDetector = {
    detectStack: vi.fn(),
  };

  return {
    repoService,
    githubService,
    localScanService,
    localStackDetector,
    getGitHubCredentials: vi.fn(),
  };
});

vi.mock('../services/repo.service.js', () => ({
  getRepoService: () => mocks.repoService,
}));

vi.mock('../services/github.service.js', () => ({
  createGitHubService: vi.fn(() => mocks.githubService),
}));

vi.mock('../services/secrets.service.js', () => ({
  getGitHubCredentials: mocks.getGitHubCredentials,
}));

vi.mock('../services/local-scan.service.js', () => ({
  getLocalScanService: () => mocks.localScanService,
}));

vi.mock('../services/stack-detector.service.js', () => ({
  createLocalStackDetector: vi.fn(() => mocks.localStackDetector),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    errorWithStack: vi.fn(),
  }),
}));

const { default: reposRouter } = await import('./repos.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/repos', reposRouter);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error.message });
  });
  return app;
}

describe('repos routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGitHubCredentials.mockReturnValue(null);
    mocks.repoService.getRepositories.mockResolvedValue([]);
    mocks.repoService.getRepositoryByUrl.mockResolvedValue(null);
    mocks.repoService.createRepository.mockResolvedValue({
      id: 'repo-1',
      name: 'acme/repo',
      url: 'https://github.com/acme/repo',
      default_branch: 'main',
    });
    mocks.localStackDetector.detectStack.mockResolvedValue({
      detected_stack: {
        framework: 'react',
        state_management: null,
        styling: 'tailwind',
        testing: 'vitest',
      },
    });
  });

  it('lists repositories and sets no-store cache header', async () => {
    const app = buildApp();
    mocks.repoService.getRepositories.mockResolvedValue([{ id: 'r1', name: 'repo' }]);

    const response = await request(app).get('/api/repos');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toEqual([{ id: 'r1', name: 'repo' }]);
  });

  it('requires GitHub token for /github/repos', async () => {
    const app = buildApp();

    const response = await request(app).get('/api/repos/github/repos');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
  });

  it('uses searchRepos when search query is provided', async () => {
    const app = buildApp();
    mocks.githubService.searchRepos.mockResolvedValue({
      repos: [{ id: 1, full_name: 'acme/repo' }],
      total: 1,
    });

    const response = await request(app)
      .get('/api/repos/github/repos')
      .set('x-github-token', 'gh-token')
      .query({ search: 'acme', page: 2, per_page: 10 });

    expect(response.status).toBe(200);
    expect(mocks.githubService.searchRepos).toHaveBeenCalledWith('acme', { page: 2, perPage: 10 });
    expect(mocks.githubService.listUserRepos).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid repository payload on create', async () => {
    const app = buildApp();

    const response = await request(app).post('/api/repos').send({
      name: '',
      url: 'invalid-url',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation Error');
  });

  it('returns 409 when creating a duplicate repository', async () => {
    const app = buildApp();
    mocks.repoService.getRepositoryByUrl.mockResolvedValue({ id: 'existing' });

    const response = await request(app).post('/api/repos').send({
      name: 'acme/repo',
      url: 'https://github.com/acme/repo',
      default_branch: 'main',
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('REPO_EXISTS');
    expect(mocks.repoService.createRepository).not.toHaveBeenCalled();
  });

  it('creates repository with token from stored secrets when header is absent', async () => {
    const app = buildApp();
    mocks.getGitHubCredentials.mockReturnValue({ token: 'stored-token' });

    const response = await request(app).post('/api/repos').send({
      name: 'acme/repo',
      url: 'https://github.com/acme/repo',
      default_branch: 'main',
    });

    expect(response.status).toBe(201);
    expect(mocks.repoService.createRepository).toHaveBeenCalledWith(
      {
        name: 'acme/repo',
        url: 'https://github.com/acme/repo',
        default_branch: 'main',
      },
      'stored-token'
    );
  });

  it('validates required fields for adding local repositories', async () => {
    const app = buildApp();

    const response = await request(app).post('/api/repos/local/add').send({
      name: 'local-repo',
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('name and path are required');
  });

  it('returns conflict when local repository already exists', async () => {
    const app = buildApp();
    mocks.repoService.getRepositoryByUrl.mockResolvedValue({ id: 'existing' });

    const response = await request(app).post('/api/repos/local/add').send({
      name: 'local-repo',
      path: 'C:/projects/repo',
      default_branch: 'main',
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('REPO_EXISTS');
    expect(mocks.repoService.createRepositoryWithStack).not.toHaveBeenCalled();
  });

  it('adds local repository with detected stack', async () => {
    const app = buildApp();
    mocks.repoService.createRepositoryWithStack.mockResolvedValue({
      id: 'local-1',
      name: 'local-repo',
      url: 'file://C:/projects/repo',
    });

    const response = await request(app).post('/api/repos/local/add').send({
      name: 'local-repo',
      path: 'C:/projects/repo',
      default_branch: 'main',
    });

    expect(response.status).toBe(201);
    expect(mocks.localStackDetector.detectStack).toHaveBeenCalledWith('C:/projects/repo');
    expect(mocks.repoService.createRepositoryWithStack).toHaveBeenCalledWith(
      {
        name: 'local-repo',
        url: 'file://C:/projects/repo',
        default_branch: 'main',
      },
      expect.objectContaining({
        framework: 'react',
      })
    );
  });
});
