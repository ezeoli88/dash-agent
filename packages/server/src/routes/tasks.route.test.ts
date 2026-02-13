import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_TASK_ID = '123e4567-e89b-12d3-a456-426614174000';

const mocks = vi.hoisted(() => {
  const taskService = {
    create: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateSpec: vi.fn(),
    approveSpec: vi.fn(),
  };

  const agentService = {
    isAgentRunning: vi.fn(),
    cancelAgent: vi.fn(),
    cleanupTaskWorktree: vi.fn(),
    startAgent: vi.fn(),
    sendFeedback: vi.fn(),
    addUserMessageToHistory: vi.fn(),
    storeFeedbackForResume: vi.fn(),
    approvePlan: vi.fn(),
    pushAndCreatePR: vi.fn(),
    getAgentLogs: vi.fn(),
    getChatHistory: vi.fn(),
    getTimeoutInfo: vi.fn(),
    approveAndCreatePR: vi.fn(),
    requestChanges: vi.fn(),
    markPRMerged: vi.fn(),
    markPRClosed: vi.fn(),
    extendTimeout: vi.fn(),
  };

  const sseEmitter = {
    emitStatus: vi.fn(),
    emitError: vi.fn(),
    emitLog: vi.fn(),
    emitAwaitingReview: vi.fn(),
    addClient: vi.fn(),
  };

  const gitService = {
    getWorktreePath: vi.fn(),
    getChangedFiles: vi.fn(),
    getDiff: vi.fn(),
    getConflictingFiles: vi.fn(),
    hasConflictMarkers: vi.fn(),
    worktreeExists: vi.fn(),
  };

  const githubClient = {
    getPullRequestComments: vi.fn(),
  };

  return {
    taskService,
    agentService,
    sseEmitter,
    gitService,
    githubClient,
    executeSpec: vi.fn(),
    generateSpec: vi.fn(),
    regenerateSpec: vi.fn(),
    cancelSpecGeneration: vi.fn(),
    cancelExecution: vi.fn(),
    getAICredentials: vi.fn(),
    getGitHubClient: vi.fn(),
    execGitOrThrow: vi.fn(),
    spawnMock: vi.fn(),
  };
});

vi.mock('../services/task.service.js', () => ({
  taskService: mocks.taskService,
  default: mocks.taskService,
}));

vi.mock('../services/agent.service.js', () => ({
  getAgentService: () => mocks.agentService,
}));

vi.mock('../utils/sse-emitter.js', () => ({
  getSSEEmitter: () => mocks.sseEmitter,
}));

vi.mock('../services/git.service.js', () => ({
  getGitService: () => mocks.gitService,
  execGitOrThrow: mocks.execGitOrThrow,
}));

vi.mock('../services/dev-agent.service.js', () => ({
  executeSpec: mocks.executeSpec,
  cancelExecution: mocks.cancelExecution,
}));

vi.mock('../services/pm-agent.service.js', () => ({
  generateSpec: mocks.generateSpec,
  regenerateSpec: mocks.regenerateSpec,
  cancelSpecGeneration: mocks.cancelSpecGeneration,
}));

vi.mock('../services/secrets.service.js', () => ({
  getAICredentials: mocks.getAICredentials,
}));

vi.mock('../github/client.js', () => ({
  getGitHubClient: () => mocks.githubClient,
}));

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => {
    mocks.spawnMock(...args);
    return { unref: vi.fn() };
  },
}));

vi.mock('../services/pr-comments.service.js', () => ({
  getPRCommentsService: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const { default: tasksRouter } = await import('./tasks.js');

function buildTask(status: string) {
  return {
    id: TEST_TASK_ID,
    title: 'Task',
    description: 'desc',
    repo_url: 'https://github.com/acme/repo',
    target_branch: 'main',
    context_files: [],
    build_command: null,
    repository_id: 'f6b102a0-9c66-4a4a-8304-78b3f117cb1d',
    user_input: 'User input',
    generated_spec: null,
    generated_spec_at: null,
    final_spec: null,
    spec_approved_at: null,
    was_spec_edited: false,
    branch_name: null,
    pr_number: null,
    agent_type: null,
    agent_model: null,
    changes_data: null,
    conflict_files: null,
    status,
    pr_url: null,
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', tasksRouter);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error.message });
  });
  return app;
}

describe('tasks routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.taskService.getById.mockReturnValue(buildTask('draft'));
    mocks.taskService.update.mockImplementation((id: string, input: Record<string, unknown>) => {
      const current = buildTask('draft');
      return {
        ...current,
        id,
        ...input,
      };
    });

    mocks.agentService.isAgentRunning.mockReturnValue(false);
    mocks.agentService.startAgent.mockResolvedValue(undefined);
    mocks.executeSpec.mockResolvedValue(undefined);
  });

  it('rejects invalid UUID before loading task', async () => {
    const app = createApp();
    const response = await request(app).get('/api/tasks/not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid task ID format');
    expect(mocks.taskService.getById).not.toHaveBeenCalled();
  });

  it('blocks execute for invalid status transition', async () => {
    const app = createApp();
    mocks.taskService.getById.mockReturnValue(buildTask('draft'));

    const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/execute`).send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid task status');
    expect(response.body.message).toContain('Cannot execute task with status: draft');
  });

  it('starts Dev Agent when task is approved', async () => {
    const app = createApp();
    mocks.taskService.getById.mockReturnValue(buildTask('approved'));

    const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/execute`).send({});

    expect(response.status).toBe(202);
    expect(response.body.task_status).toBe('coding');
    expect(mocks.executeSpec).toHaveBeenCalledTimes(1);
    expect(mocks.executeSpec).toHaveBeenCalledWith({ task_id: TEST_TASK_ID });
    expect(mocks.agentService.startAgent).not.toHaveBeenCalled();
  });

  it('moves failed task to planning and retries agent execution', async () => {
    const app = createApp();
    mocks.taskService.getById.mockReturnValue(buildTask('failed'));
    mocks.taskService.update.mockReturnValue(buildTask('planning'));

    const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/execute`).send({});

    expect(response.status).toBe(202);
    expect(response.body.task_status).toBe('planning');
    expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, { status: 'planning', error: null });
    expect(mocks.sseEmitter.emitStatus).toHaveBeenCalledWith(TEST_TASK_ID, 'planning');
    expect(mocks.agentService.startAgent).toHaveBeenCalledWith(TEST_TASK_ID, false);
  });

  it('sends feedback directly to running agent', async () => {
    const app = createApp();
    mocks.taskService.getById.mockReturnValue(buildTask('coding'));
    mocks.agentService.isAgentRunning.mockReturnValue(true);

    const response = await request(app)
      .post(`/api/tasks/${TEST_TASK_ID}/feedback`)
      .send({ message: 'Please add tests' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('feedback_sent');
    expect(mocks.agentService.sendFeedback).toHaveBeenCalledWith(TEST_TASK_ID, 'Please add tests');
  });

  it('rejects feedback when task is terminal and no agent is running', async () => {
    const app = createApp();
    mocks.taskService.getById.mockReturnValue(buildTask('done'));
    mocks.agentService.isAgentRunning.mockReturnValue(false);

    const response = await request(app)
      .post(`/api/tasks/${TEST_TASK_ID}/feedback`)
      .send({ message: 'One more change' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Cannot send feedback');
    expect(mocks.agentService.startAgent).not.toHaveBeenCalled();
  });

  it('resumes agent from feedback when task is reviewable and idle', async () => {
    const app = createApp();
    mocks.taskService.getById.mockReturnValue(buildTask('awaiting_review'));
    mocks.agentService.isAgentRunning.mockReturnValue(false);
    mocks.taskService.update.mockReturnValue(buildTask('planning'));

    const response = await request(app)
      .post(`/api/tasks/${TEST_TASK_ID}/feedback`)
      .send({ message: 'Address reviewer comments' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('agent_resumed');
    expect(mocks.agentService.addUserMessageToHistory).toHaveBeenCalledWith(TEST_TASK_ID, 'Address reviewer comments');
    expect(mocks.agentService.storeFeedbackForResume).toHaveBeenCalledWith(TEST_TASK_ID, 'Address reviewer comments');
    expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, { status: 'planning' });
    expect(mocks.sseEmitter.emitStatus).toHaveBeenCalledWith(TEST_TASK_ID, 'planning');
    expect(mocks.agentService.startAgent).toHaveBeenCalledWith(TEST_TASK_ID, true);
  });

  it('streams terminal complete event for done tasks in logs endpoint', async () => {
    const app = createApp();
    mocks.taskService.getById.mockReturnValue({
      ...buildTask('done'),
      pr_url: 'https://github.com/acme/repo/pull/123',
    });
    mocks.agentService.getAgentLogs.mockReturnValue([]);
    mocks.agentService.getChatHistory.mockReturnValue([]);
    mocks.agentService.getTimeoutInfo.mockReturnValue(null);
    mocks.sseEmitter.addClient.mockReturnValue('client-1');

    const response = await request(app).get(`/api/tasks/${TEST_TASK_ID}/logs`);

    expect(response.status).toBe(200);
    expect(response.text).toContain('event: status');
    expect(response.text).toContain('event: complete');
    expect(response.text).toContain('pull/123');
    expect(mocks.sseEmitter.addClient).toHaveBeenCalledWith(TEST_TASK_ID, expect.anything());
  });

  it('streams terminal error event for failed tasks in logs endpoint', async () => {
    const app = createApp();
    mocks.taskService.getById.mockReturnValue({
      ...buildTask('failed'),
      error: 'Agent crashed',
    });
    mocks.agentService.getAgentLogs.mockReturnValue([]);
    mocks.agentService.getChatHistory.mockReturnValue([]);
    mocks.agentService.getTimeoutInfo.mockReturnValue(null);
    mocks.sseEmitter.addClient.mockReturnValue('client-2');

    const response = await request(app).get(`/api/tasks/${TEST_TASK_ID}/logs`);

    expect(response.status).toBe(200);
    expect(response.text).toContain('event: status');
    expect(response.text).toContain('event: error');
    expect(response.text).toContain('Agent crashed');
    expect(mocks.sseEmitter.addClient).toHaveBeenCalledWith(TEST_TASK_ID, expect.anything());
  });

  // ===========================================================================
  // Tier 1 — Spec Generation
  // ===========================================================================

  describe('POST /tasks/:id/generate-spec', () => {
    it('rejects if task status is NOT draft', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('pending_approval'));

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/generate-spec`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task status');
      expect(response.body.message).toContain('Cannot generate spec for task with status: pending_approval');
      expect(mocks.generateSpec).not.toHaveBeenCalled();
    });

    it('succeeds for draft status and returns 202', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('draft'));
      mocks.generateSpec.mockResolvedValue({ model_used: 'gpt-4', tokens_used: 100 });
      mocks.getAICredentials.mockReturnValue({ provider: 'openai', apiKey: 'key-123' });

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/generate-spec`).send({});

      expect(response.status).toBe(202);
      expect(response.body.status).toBe('generating');
      expect(mocks.generateSpec).toHaveBeenCalledWith({ task_id: TEST_TASK_ID }, { provider: 'openai', apiKey: 'key-123' });
    });

    it('passes additional_context when provided', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('draft'));
      mocks.generateSpec.mockResolvedValue({ model_used: 'gpt-4', tokens_used: 100 });
      mocks.getAICredentials.mockReturnValue(null);

      const response = await request(app)
        .post(`/api/tasks/${TEST_TASK_ID}/generate-spec`)
        .send({ additional_context: 'Use React for the frontend' });

      expect(response.status).toBe(202);
      expect(mocks.generateSpec).toHaveBeenCalledWith(
        { task_id: TEST_TASK_ID, additional_context: 'Use React for the frontend' },
        undefined,
      );
    });

    it('works without additional_context', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('draft'));
      mocks.generateSpec.mockResolvedValue({ model_used: 'gpt-4', tokens_used: 50 });
      mocks.getAICredentials.mockReturnValue(null);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/generate-spec`).send({});

      expect(response.status).toBe(202);
      expect(mocks.generateSpec).toHaveBeenCalledWith({ task_id: TEST_TASK_ID }, undefined);
    });
  });

  // ===========================================================================
  // Tier 1 — Spec Regeneration
  // ===========================================================================

  describe('POST /tasks/:id/regenerate-spec', () => {
    it('rejects if task status is NOT pending_approval', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('draft'));

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/regenerate-spec`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task status');
      expect(response.body.message).toContain('Cannot regenerate spec for task with status: draft');
      expect(mocks.regenerateSpec).not.toHaveBeenCalled();
    });

    it('succeeds for pending_approval status and returns 202', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('pending_approval'));
      mocks.regenerateSpec.mockResolvedValue({ model_used: 'gpt-4', tokens_used: 200 });
      mocks.getAICredentials.mockReturnValue(null);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/regenerate-spec`).send({});

      expect(response.status).toBe(202);
      expect(response.body.status).toBe('regenerating');
      expect(mocks.regenerateSpec).toHaveBeenCalledWith(TEST_TASK_ID, undefined, undefined);
    });
  });

  // ===========================================================================
  // Tier 1 — Spec Edit
  // ===========================================================================

  describe('PATCH /tasks/:id/spec', () => {
    it('rejects if status is NOT pending_approval', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('draft'));

      const response = await request(app)
        .patch(`/api/tasks/${TEST_TASK_ID}/spec`)
        .send({ spec: 'Some spec content that is long enough' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task status');
      expect(response.body.message).toContain('Cannot edit spec for task with status: draft');
    });

    it('succeeds with valid spec body for pending_approval status', async () => {
      const app = createApp();
      const task = buildTask('pending_approval');
      mocks.taskService.getById.mockReturnValue(task);
      mocks.taskService.updateSpec.mockReturnValue({ ...task, generated_spec: 'Updated spec content here', was_spec_edited: true });

      const response = await request(app)
        .patch(`/api/tasks/${TEST_TASK_ID}/spec`)
        .send({ spec: 'Updated spec content here' });

      expect(response.status).toBe(200);
      expect(mocks.taskService.updateSpec).toHaveBeenCalledWith(TEST_TASK_ID, 'Updated spec content here', false);
    });

    it('rejects with too-short spec (validation error)', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('pending_approval'));

      const response = await request(app)
        .patch(`/api/tasks/${TEST_TASK_ID}/spec`)
        .send({ spec: 'short' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('rejects with empty body (missing spec field)', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('pending_approval'));

      const response = await request(app)
        .patch(`/api/tasks/${TEST_TASK_ID}/spec`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  // ===========================================================================
  // Tier 1 — Spec Approval
  // ===========================================================================

  describe('POST /tasks/:id/approve-spec', () => {
    it('rejects if status is NOT pending_approval', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('draft'));

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/approve-spec`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task status');
      expect(response.body.message).toContain('Cannot approve spec for task with status: draft');
    });

    it('succeeds for pending_approval status', async () => {
      const app = createApp();
      const task = buildTask('pending_approval');
      mocks.taskService.getById.mockReturnValue(task);
      mocks.taskService.approveSpec.mockReturnValue({ ...task, status: 'approved' });
      mocks.executeSpec.mockResolvedValue(undefined);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/approve-spec`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('approved');
      expect(response.body.task_status).toBe('approved');
      expect(mocks.taskService.approveSpec).toHaveBeenCalledWith(TEST_TASK_ID, undefined);
      expect(mocks.sseEmitter.emitStatus).toHaveBeenCalledWith(TEST_TASK_ID, 'approved');
      expect(mocks.executeSpec).toHaveBeenCalledWith({ task_id: TEST_TASK_ID });
    });

    it('returns 500 when approveSpec fails', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('pending_approval'));
      mocks.taskService.approveSpec.mockReturnValue(null);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/approve-spec`).send({});

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to approve spec');
    });
  });

  // ===========================================================================
  // Tier 1 — Merge Conflict Resolution
  // ===========================================================================

  describe('POST /tasks/:id/resolve-conflicts', () => {
    it('rejects if status is NOT merge_conflicts', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('coding'));

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/resolve-conflicts`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task status');
      expect(response.body.message).toContain('Cannot resolve conflicts for task with status: coding');
    });

    it('returns 409 if conflict markers still present', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue({
        ...buildTask('merge_conflicts'),
        conflict_files: JSON.stringify(['src/index.ts']),
      });
      mocks.gitService.getWorktreePath.mockReturnValue('/tmp/worktree');
      mocks.gitService.hasConflictMarkers.mockResolvedValue(['src/index.ts']);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/resolve-conflicts`).send({});

      expect(response.status).toBe(409);
      expect(response.body.files).toEqual(['src/index.ts']);
    });

    it('returns 400 when no worktree exists', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('merge_conflicts'));
      mocks.gitService.getWorktreePath.mockReturnValue(null);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/resolve-conflicts`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No worktree');
    });

    it('succeeds when all conflicts are resolved', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue({
        ...buildTask('merge_conflicts'),
        conflict_files: JSON.stringify(['src/index.ts']),
      });
      mocks.gitService.getWorktreePath.mockReturnValue('/tmp/worktree');
      mocks.gitService.hasConflictMarkers.mockResolvedValue([]);
      mocks.execGitOrThrow.mockResolvedValue(undefined);
      mocks.agentService.pushAndCreatePR.mockResolvedValue(undefined);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/resolve-conflicts`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('resolving');
      expect(mocks.execGitOrThrow).toHaveBeenCalledWith(['add', '.'], '/tmp/worktree');
      expect(mocks.execGitOrThrow).toHaveBeenCalledWith(['commit', '--no-edit'], '/tmp/worktree');
      expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, {
        status: 'approved',
        conflict_files: null,
        error: null,
      });
      expect(mocks.agentService.pushAndCreatePR).toHaveBeenCalledWith(TEST_TASK_ID);
    });

    it('falls back to git for conflict files when task has no conflict_files', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('merge_conflicts'));
      mocks.gitService.getWorktreePath.mockReturnValue('/tmp/worktree');
      mocks.gitService.getConflictingFiles.mockResolvedValue(['file.ts']);
      mocks.gitService.hasConflictMarkers.mockResolvedValue([]);
      mocks.execGitOrThrow.mockResolvedValue(undefined);
      mocks.agentService.pushAndCreatePR.mockResolvedValue(undefined);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/resolve-conflicts`).send({});

      expect(response.status).toBe(200);
      expect(mocks.gitService.getConflictingFiles).toHaveBeenCalledWith('/tmp/worktree');
    });
  });

  // ===========================================================================
  // Tier 1 — Open Editor
  // ===========================================================================

  describe('POST /tasks/:id/open-editor', () => {
    it('rejects if status is NOT merge_conflicts', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('coding'));

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/open-editor`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task status');
      expect(response.body.message).toContain('Cannot open editor for task with status: coding');
    });

    it('returns 400 when no worktree exists', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('merge_conflicts'));
      mocks.gitService.getWorktreePath.mockReturnValue(null);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/open-editor`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No worktree');
    });

    it('succeeds for merge_conflicts status with existing worktree', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('merge_conflicts'));
      mocks.gitService.getWorktreePath.mockReturnValue('/tmp/worktree');

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/open-editor`).send({});

      expect(response.status).toBe(200);
      expect(response.body.opened).toBe(true);
      expect(response.body.path).toBe('/tmp/worktree');
      expect(mocks.spawnMock).toHaveBeenCalledWith('code', ['/tmp/worktree'], expect.objectContaining({ detached: true }));
    });
  });

  // ===========================================================================
  // Tier 1 — PR Operations
  // ===========================================================================

  describe('POST /tasks/:id/approve (PR)', () => {
    it('rejects wrong status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('coding'));

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/approve`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task status');
      expect(response.body.message).toContain('Cannot approve task with status: coding');
    });

    it('succeeds for awaiting_review status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('awaiting_review'));
      mocks.agentService.approveAndCreatePR.mockResolvedValue('https://github.com/acme/repo/pull/42');

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/approve`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('approved');
      expect(response.body.pr_url).toBe('https://github.com/acme/repo/pull/42');
      expect(mocks.agentService.approveAndCreatePR).toHaveBeenCalledWith(TEST_TASK_ID);
    });

    it('succeeds for review status (legacy)', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('review'));
      mocks.agentService.approveAndCreatePR.mockResolvedValue('https://github.com/acme/repo/pull/99');

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/approve`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('approved');
    });
  });

  describe('POST /tasks/:id/request-changes', () => {
    it('rejects wrong status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('draft'));

      const response = await request(app)
        .post(`/api/tasks/${TEST_TASK_ID}/request-changes`)
        .send({ feedback: 'Please fix the tests' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task status');
      expect(response.body.message).toContain('Cannot request changes for task with status: draft');
    });

    it('rejects missing feedback', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('pr_created'));

      const response = await request(app)
        .post(`/api/tasks/${TEST_TASK_ID}/request-changes`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('succeeds for pr_created status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('pr_created'));
      mocks.agentService.requestChanges.mockResolvedValue(undefined);

      const response = await request(app)
        .post(`/api/tasks/${TEST_TASK_ID}/request-changes`)
        .send({ feedback: 'Please fix the tests' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('changes_requested');
      expect(mocks.agentService.requestChanges).toHaveBeenCalledWith(TEST_TASK_ID, 'Please fix the tests');
    });

    it('succeeds for review status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('review'));
      mocks.agentService.requestChanges.mockResolvedValue(undefined);

      const response = await request(app)
        .post(`/api/tasks/${TEST_TASK_ID}/request-changes`)
        .send({ feedback: 'Add error handling' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('changes_requested');
    });
  });

  describe('POST /tasks/:id/pr-merged', () => {
    it('rejects wrong status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('draft'));

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/pr-merged`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task status');
      expect(response.body.message).toContain('Cannot mark PR as merged for task with status: draft');
    });

    it('succeeds for pr_created status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('pr_created'));
      mocks.agentService.markPRMerged.mockResolvedValue(undefined);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/pr-merged`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('done');
      expect(mocks.agentService.markPRMerged).toHaveBeenCalledWith(TEST_TASK_ID);
    });

    it('succeeds for review status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('review'));
      mocks.agentService.markPRMerged.mockResolvedValue(undefined);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/pr-merged`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('done');
    });
  });

  describe('POST /tasks/:id/pr-closed', () => {
    it('rejects wrong status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('draft'));

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/pr-closed`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task status');
      expect(response.body.message).toContain('Cannot mark PR as closed for task with status: draft');
    });

    it('succeeds for pr_created status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('pr_created'));
      mocks.agentService.markPRClosed.mockResolvedValue(undefined);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/pr-closed`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('canceled');
      expect(mocks.agentService.markPRClosed).toHaveBeenCalledWith(TEST_TASK_ID);
    });

    it('succeeds for changes_requested status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('changes_requested'));
      mocks.agentService.markPRClosed.mockResolvedValue(undefined);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/pr-closed`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('canceled');
    });
  });

  // ===========================================================================
  // Tier 2 — Plan Approval
  // ===========================================================================

  describe('POST /tasks/:id/approve-plan', () => {
    it('rejects if status is NOT plan_review', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('coding'));

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/approve-plan`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid task status');
      expect(response.body.message).toContain('Cannot approve plan for task with status: coding');
    });

    it('succeeds for plan_review status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('plan_review'));
      mocks.agentService.approvePlan.mockResolvedValue(undefined);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/approve-plan`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('approved');
      expect(response.body.message).toContain('Plan approved');
      expect(mocks.agentService.approvePlan).toHaveBeenCalledWith(TEST_TASK_ID);
    });
  });

  // ===========================================================================
  // Tier 2 — Timeout Extension
  // ===========================================================================

  describe('POST /tasks/:id/extend', () => {
    it('returns 400 when no agent is running', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('coding'));
      mocks.agentService.isAgentRunning.mockReturnValue(false);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/extend`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No active agent');
    });

    it('succeeds when agent is running', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('coding'));
      mocks.agentService.isAgentRunning.mockReturnValue(true);
      const futureDate = new Date('2026-01-01T12:00:00Z');
      mocks.agentService.extendTimeout.mockReturnValue(futureDate);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/extend`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('extended');
      expect(response.body.new_timeout).toBe(futureDate.toISOString());
      expect(mocks.agentService.extendTimeout).toHaveBeenCalledWith(TEST_TASK_ID);
    });
  });

  // ===========================================================================
  // Tier 2 — Changes Endpoint
  // ===========================================================================

  describe('GET /tasks/:id/changes', () => {
    it('returns live worktree changes when available', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('awaiting_review'));
      mocks.gitService.getWorktreePath.mockReturnValue('/tmp/worktree');
      mocks.gitService.getChangedFiles.mockResolvedValue([
        { path: 'src/app.ts', status: 'modified', additions: 10, deletions: 2 },
      ]);
      mocks.gitService.getDiff.mockResolvedValue('diff --git a/src/app.ts b/src/app.ts\n...');

      const response = await request(app).get(`/api/tasks/${TEST_TASK_ID}/changes`);

      expect(response.status).toBe(200);
      expect(response.body.files).toHaveLength(1);
      expect(response.body.files[0].path).toBe('src/app.ts');
      expect(response.body.diff).toContain('diff --git');
    });

    it('falls back to persisted changes_data when no worktree', async () => {
      const app = createApp();
      const changesData = JSON.stringify({
        files: [{ path: 'README.md', status: 'added', additions: 5, deletions: 0 }],
        diff: 'persisted diff',
      });
      mocks.taskService.getById.mockReturnValue({
        ...buildTask('done'),
        changes_data: changesData,
      });
      mocks.gitService.getWorktreePath.mockReturnValue(null);

      const response = await request(app).get(`/api/tasks/${TEST_TASK_ID}/changes`);

      expect(response.status).toBe(200);
      expect(response.body.files).toHaveLength(1);
      expect(response.body.files[0].path).toBe('README.md');
    });

    it('returns 400 when no changes available', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('draft'));
      mocks.gitService.getWorktreePath.mockReturnValue(null);

      const response = await request(app).get(`/api/tasks/${TEST_TASK_ID}/changes`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No changes available');
    });
  });

  // ===========================================================================
  // Tier 2 — Start Endpoint
  // ===========================================================================

  describe('POST /tasks/:id/start', () => {
    it('succeeds for draft status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('draft'));
      mocks.agentService.startAgent.mockResolvedValue(undefined);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/start`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('started');
      expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, expect.objectContaining({
        status: 'planning',
        branch_name: expect.stringContaining('feature/task-'),
      }));
      expect(mocks.sseEmitter.emitStatus).toHaveBeenCalledWith(TEST_TASK_ID, 'planning');
      expect(mocks.agentService.startAgent).toHaveBeenCalledWith(TEST_TASK_ID, false);
    });

    it('succeeds for failed status (retry)', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('failed'));
      mocks.agentService.startAgent.mockResolvedValue(undefined);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/start`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('started');
      expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, expect.objectContaining({
        status: 'planning',
        error: null,
      }));
    });

    it('rejects for non-draft/non-failed status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('coding'));

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/start`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid status');
      expect(response.body.message).toContain('Cannot start task with status: coding');
    });
  });

  // ===========================================================================
  // Tier 2 — Cancellation
  // ===========================================================================

  describe('POST /tasks/:id/cancel', () => {
    it('cancels PM Agent for refining status', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('refining'));

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/cancel`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('cancelled');
      expect(mocks.cancelSpecGeneration).toHaveBeenCalledWith(TEST_TASK_ID);
      expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, { status: 'draft', error: 'Spec generation cancelled' });
      expect(mocks.sseEmitter.emitStatus).toHaveBeenCalledWith(TEST_TASK_ID, 'draft');
    });

    it('cancels running Dev Agent', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('coding'));
      mocks.agentService.isAgentRunning.mockReturnValue(true);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/cancel`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('cancelled');
      expect(mocks.agentService.cancelAgent).toHaveBeenCalledWith(TEST_TASK_ID);
    });

    it('resets stuck task to canceled when no agent is running', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('planning'));
      mocks.agentService.isAgentRunning.mockReturnValue(false);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/cancel`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('cancelled');
      expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, {
        status: 'canceled',
        error: 'Task canceled by user (agent not running)',
      });
    });

    it('returns 400 when task is not active and no agent running', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('done'));
      mocks.agentService.isAgentRunning.mockReturnValue(false);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/cancel`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No active agent');
    });
  });

  // ===========================================================================
  // Tier 3 — PR Comments
  // ===========================================================================

  describe('GET /tasks/:id/pr-comments', () => {
    it('returns 400 if no pr_url on task', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('pr_created'));

      const response = await request(app).get(`/api/tasks/${TEST_TASK_ID}/pr-comments`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No PR');
    });

    it('succeeds when pr_url exists and returns comments', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue({
        ...buildTask('pr_created'),
        pr_url: 'https://github.com/acme/repo/pull/42',
      });
      mocks.githubClient.getPullRequestComments.mockResolvedValue([
        {
          id: 1,
          body: 'Looks good!',
          author: { login: 'reviewer', avatarUrl: 'https://avatar.com/1' },
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          url: 'https://github.com/acme/repo/pull/42#comment-1',
          isReviewComment: false,
          path: null,
          line: null,
        },
      ]);

      const response = await request(app).get(`/api/tasks/${TEST_TASK_ID}/pr-comments`);

      expect(response.status).toBe(200);
      expect(response.body.comments).toHaveLength(1);
      expect(response.body.comments[0].body).toBe('Looks good!');
      expect(response.body.totalCount).toBe(1);
      expect(mocks.githubClient.getPullRequestComments).toHaveBeenCalledWith('https://github.com/acme/repo', 42);
    });

    it('returns 400 for invalid PR URL format', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue({
        ...buildTask('pr_created'),
        pr_url: 'https://github.com/acme/repo/issues/42',
      });

      const response = await request(app).get(`/api/tasks/${TEST_TASK_ID}/pr-comments`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid PR URL');
    });
  });

  // ===========================================================================
  // Tier 3 — Cleanup Worktree
  // ===========================================================================

  describe('POST /tasks/:id/cleanup-worktree', () => {
    it('returns 400 when agent is running', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('coding'));
      mocks.agentService.isAgentRunning.mockReturnValue(true);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/cleanup-worktree`).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Agent is running');
    });

    it('returns no_worktree when worktree does not exist', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('done'));
      mocks.agentService.isAgentRunning.mockReturnValue(false);
      mocks.gitService.worktreeExists.mockResolvedValue(false);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/cleanup-worktree`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('no_worktree');
    });

    it('succeeds when worktree exists and cleanup works', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('done'));
      mocks.agentService.isAgentRunning.mockReturnValue(false);
      mocks.gitService.worktreeExists.mockResolvedValue(true);
      mocks.agentService.cleanupTaskWorktree.mockResolvedValue(undefined);

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/cleanup-worktree`).send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('cleaned');
      expect(mocks.agentService.cleanupTaskWorktree).toHaveBeenCalledWith(TEST_TASK_ID, 'manual cleanup requested');
    });

    it('returns 500 with recovery steps when cleanup fails', async () => {
      const app = createApp();
      mocks.taskService.getById.mockReturnValue(buildTask('done'));
      mocks.agentService.isAgentRunning.mockReturnValue(false);
      mocks.gitService.worktreeExists.mockResolvedValue(true);
      mocks.agentService.cleanupTaskWorktree.mockRejectedValue(new Error('EBUSY: resource busy'));

      const response = await request(app).post(`/api/tasks/${TEST_TASK_ID}/cleanup-worktree`).send({});

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Cleanup failed');
      expect(response.body.message).toBe('EBUSY: resource busy');
      expect(response.body.recovery_steps).toBeInstanceOf(Array);
      expect(response.body.recovery_steps.length).toBeGreaterThan(0);
    });
  });
});
