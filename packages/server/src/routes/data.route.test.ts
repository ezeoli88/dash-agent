import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const repoService = {
    getRepositories: vi.fn(),
    deleteRepository: vi.fn(),
    getRepositoryByUrl: vi.fn(),
    createRepository: vi.fn(),
  };

  const dbExec = vi.fn();
  const dbRun = vi.fn();
  const db = {
    exec: dbExec,
    run: dbRun,
  };

  return {
    repoService,
    db,
    dbExec,
    dbRun,
    withTransaction: vi.fn(),
  };
});

vi.mock('../db/database.js', () => ({
  getDatabase: () => mocks.db,
  withTransaction: mocks.withTransaction,
}));

vi.mock('../services/repo.service.js', () => ({
  getRepoService: () => mocks.repoService,
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

const { default: dataRouter } = await import('./data.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/data', dataRouter);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error.message });
  });
  return app;
}

describe('data routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.withTransaction.mockImplementation((fn: () => unknown) => fn());
    mocks.repoService.getRepositories.mockResolvedValue([]);
    mocks.repoService.deleteRepository.mockResolvedValue(undefined);
    mocks.repoService.getRepositoryByUrl.mockResolvedValue(null);
    mocks.repoService.createRepository.mockResolvedValue({ id: 'repo-new' });

    mocks.dbExec.mockImplementation((query: string) => {
      if (query === 'SELECT * FROM tasks') {
        return [{ columns: ['id', 'title'], values: [['task-1', 'Task 1']] }];
      }
      if (query === 'SELECT * FROM task_logs') {
        return [{ columns: ['id', 'task_id', 'message'], values: [['log-1', 'task-1', 'started']] }];
      }
      if (query === 'SELECT COUNT(*) FROM tasks') {
        return [{ values: [[3]] }];
      }
      if (query === 'SELECT COUNT(*) FROM task_logs') {
        return [{ values: [[5]] }];
      }
      return [];
    });
  });

  it('exports tasks, logs and in-memory repositories', async () => {
    const app = buildApp();
    mocks.repoService.getRepositories.mockResolvedValue([
      { id: 'repo-1', name: 'repo', url: 'https://github.com/acme/repo' },
    ]);

    const response = await request(app).get('/api/data/export');

    expect(response.status).toBe(200);
    expect(response.body.version).toBe(1);
    expect(Array.isArray(response.body.tasks)).toBe(true);
    expect(response.body.tasks[0]).toEqual({ id: 'task-1', title: 'Task 1' });
    expect(response.body.task_logs[0]).toEqual({ id: 'log-1', task_id: 'task-1', message: 'started' });
    expect(response.body.repositories).toHaveLength(1);
    expect(Date.parse(response.body.exportedAt)).not.toBeNaN();
  });

  it('rejects invalid import payload', async () => {
    const app = buildApp();

    const response = await request(app).post('/api/data/import').send({
      tasks: 'not-an-array',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });

  it('imports data in replace mode and filters unsafe columns', async () => {
    const app = buildApp();
    mocks.repoService.getRepositories.mockResolvedValue([{ id: 'repo-old-1' }, { id: 'repo-old-2' }]);

    const response = await request(app).post('/api/data/import').send({
      repositories: [
        {
          name: 'acme/repo',
          url: 'https://github.com/acme/repo',
          default_branch: 'main',
        },
      ],
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          was_spec_edited: true,
          changes_data: { files: 2 },
          injected_column: 'DROP TABLE tasks',
        },
      ],
      task_logs: [
        {
          id: 'log-1',
          task_id: 'task-1',
          level: 'info',
          message: 'started',
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.merged).toBe(false);
    expect(response.body.imported).toEqual({
      repositories: 1,
      tasks: 1,
      task_logs: 1,
    });
    expect(mocks.repoService.deleteRepository).toHaveBeenCalledWith('repo-old-1');
    expect(mocks.repoService.deleteRepository).toHaveBeenCalledWith('repo-old-2');

    const deleteStatements = mocks.dbRun.mock.calls
      .map((call) => String(call[0]))
      .filter((sql) => sql.startsWith('DELETE FROM'));
    expect(deleteStatements).toEqual(['DELETE FROM task_logs', 'DELETE FROM tasks']);

    const tasksInsert = mocks.dbRun.mock.calls.find((call) => String(call[0]).startsWith('INSERT INTO tasks'));
    expect(tasksInsert).toBeDefined();
    expect(String(tasksInsert![0])).not.toContain('injected_column');
    expect(tasksInsert![1]).toEqual(expect.arrayContaining([1, '{"files":2}']));
  });

  it('imports data in merge mode without clearing existing records', async () => {
    const app = buildApp();
    mocks.repoService.getRepositoryByUrl.mockImplementation(async (url: string) => {
      if (url.includes('existing')) return { id: 'repo-existing' };
      return null;
    });

    const response = await request(app).post('/api/data/import?merge=true').send({
      repositories: [
        {
          name: 'existing',
          url: 'https://github.com/acme/existing',
          default_branch: 'main',
        },
        {
          name: 'new',
          url: 'https://github.com/acme/new',
          default_branch: 'main',
        },
      ],
      tasks: [],
      task_logs: [],
    });

    expect(response.status).toBe(200);
    expect(response.body.merged).toBe(true);
    expect(response.body.imported.repositories).toBe(1);
    expect(mocks.repoService.deleteRepository).not.toHaveBeenCalled();
    expect(mocks.repoService.createRepository).toHaveBeenCalledTimes(1);

    const deleteStatements = mocks.dbRun.mock.calls
      .map((call) => String(call[0]))
      .filter((sql) => sql.startsWith('DELETE FROM'));
    expect(deleteStatements).toEqual([]);
  });

  it('requires explicit confirmation before deleting all data', async () => {
    const app = buildApp();

    const response = await request(app).delete('/api/data').send({
      confirmation: 'NOPE',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Confirmation required');
  });

  it('deletes all data and returns pre-delete counts', async () => {
    const app = buildApp();
    mocks.repoService.getRepositories.mockResolvedValue([{ id: 'repo-1' }, { id: 'repo-2' }]);

    const response = await request(app).delete('/api/data').send({
      confirmation: 'DELETE',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.deleted).toEqual({
      tasks: 3,
      task_logs: 5,
      repositories: 2,
    });
    expect(mocks.repoService.deleteRepository).toHaveBeenCalledWith('repo-1');
    expect(mocks.repoService.deleteRepository).toHaveBeenCalledWith('repo-2');

    const deleteStatements = mocks.dbRun.mock.calls
      .map((call) => String(call[0]))
      .filter((sql) => sql.startsWith('DELETE FROM'));
    expect(deleteStatements).toEqual(['DELETE FROM task_logs', 'DELETE FROM tasks', 'DELETE FROM repositories']);
  });
});
