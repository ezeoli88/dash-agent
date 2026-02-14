import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from './task.service.js';

const TEST_TASK_ID = '123e4567-e89b-12d3-a456-426614174000';

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: TEST_TASK_ID,
    title: 'Implement feature',
    description: 'Feature description',
    repo_url: 'https://github.com/acme/repo',
    target_branch: 'main',
    context_files: [],
    build_command: null,
    repository_id: '123e4567-e89b-12d3-a456-426614174001',
    user_input: 'User request',
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
    status: 'backlog',
    pr_url: null,
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const mocks = vi.hoisted(() => {
  const taskService = {
    getById: vi.fn(),
    update: vi.fn(),
  };

  const gitService = {
    setupWorktree: vi.fn(),
    worktreeExists: vi.fn(),
    cleanupWorktree: vi.fn(),
    getWorktreePath: vi.fn(),
    hasChanges: vi.fn(),
    commitChanges: vi.fn(),
    getCurrentBranch: vi.fn(),
    pushBranch: vi.fn(),
    getRemoteUrl: vi.fn(),
    getChangedFiles: vi.fn(),
    getDiff: vi.fn(),
    fetchInWorktree: vi.fn(),
    getConflictingFiles: vi.fn(),
    prepareWorktreeRemoteForPR: vi.fn(),
  };

  const sseEmitter = {
    emitLog: vi.fn(),
    emitStatus: vi.fn(),
    emitError: vi.fn(),
    emitAwaitingReview: vi.fn(),
    emitComplete: vi.fn(),
    emitTimeoutWarning: vi.fn(),
    emitChatMessage: vi.fn(),
    emitToolActivity: vi.fn(),
    closeTask: vi.fn(),
  };

  const prCommentsService = {
    onTaskStatusChange: vi.fn(),
    untrackPR: vi.fn(),
  };

  const runner = {
    run: vi.fn(),
    cancel: vi.fn(),
    addFeedback: vi.fn(),
  };

  return {
    taskService,
    gitService,
    sseEmitter,
    prCommentsService,
    runner,
    createRunner: vi.fn(),
    killProcessesForTask: vi.fn(),
  };
});

vi.mock('./task.service.js', () => ({
  taskService: mocks.taskService,
  default: mocks.taskService,
}));

vi.mock('./git.service.js', () => ({
  getGitService: () => mocks.gitService,
  execGitOrThrow: vi.fn(),
}));

vi.mock('../agent/index.js', () => ({
  createRunner: mocks.createRunner,
}));

vi.mock('../utils/sse-emitter.js', () => ({
  getSSEEmitter: () => mocks.sseEmitter,
}));

vi.mock('../utils/process-killer.js', () => ({
  killProcessesForTask: mocks.killProcessesForTask,
}));

vi.mock('./pr-comments.service.js', () => ({
  getPRCommentsService: () => mocks.prCommentsService,
}));

vi.mock('./repo.service.js', () => ({
  getRepoService: () => ({
    getRepositoryById: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('../github/client.js', () => ({
  getGitHubClient: vi.fn(),
}));

vi.mock('../gitlab/client.js', () => ({
  getGitLabClient: vi.fn(),
  stripCredentialsFromUrl: (url: string) => url,
}));

vi.mock('../utils/gitlab-url.js', () => ({
  isGitLabUrl: vi.fn(() => false),
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

const { AgentService } = await import('./agent.service.js');
type AgentServiceInstance = InstanceType<typeof AgentService>;

describe('AgentService', () => {
  let service: AgentServiceInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentService();

    mocks.taskService.getById.mockReturnValue(buildTask());
    mocks.taskService.update.mockImplementation((_id: string, updates: Partial<Task>) => {
      return buildTask(updates);
    });
    mocks.gitService.setupWorktree.mockResolvedValue({
      worktreePath: 'C:/tmp/worktree',
      reused: false,
      branchName: 'feature/task',
      targetBranch: 'main',
      isEmptyRepo: false,
    });
    mocks.createRunner.mockReturnValue(mocks.runner);
    mocks.runner.run.mockResolvedValue({
      success: true,
      summary: 'Done',
      iterations: 1,
    });
    mocks.gitService.getWorktreePath.mockReturnValue(undefined);
    mocks.gitService.worktreeExists.mockResolvedValue(false);
    mocks.gitService.prepareWorktreeRemoteForPR.mockResolvedValue('https://github.com/acme/repo.git');
  });

  it('rejects startAgent when task status is not executable', async () => {
    mocks.taskService.getById.mockReturnValue(buildTask({ status: 'done' }));

    await expect(service.startAgent(TEST_TASK_ID)).rejects.toThrow(
      'Cannot start agent for task with status: done'
    );
    expect(mocks.createRunner).not.toHaveBeenCalled();
  });

  it('marks task as failed when startAgent cannot setup worktree', async () => {
    mocks.gitService.setupWorktree.mockRejectedValue(new Error('worktree setup failed'));

    await expect(service.startAgent(TEST_TASK_ID)).rejects.toThrow('worktree setup failed');
    expect(mocks.taskService.update).toHaveBeenCalledWith(
      TEST_TASK_ID,
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('worktree setup failed'),
      })
    );
    expect(mocks.sseEmitter.emitError).toHaveBeenCalledWith(
      TEST_TASK_ID,
      expect.stringContaining('Failed to start agent')
    );
  });

  it('cancels active agent and updates task state', () => {
    const runner = { cancel: vi.fn(), addFeedback: vi.fn(), run: vi.fn() };
    (service as any).activeAgents.set(TEST_TASK_ID, {
      taskId: TEST_TASK_ID,
      runner,
      promise: Promise.resolve({ success: true, iterations: 1 }),
      startedAt: new Date(),
      timeoutTimer: null,
      warningTimer: null,
      timeoutAt: new Date(Date.now() + 30_000),
      warningSent: false,
    });

    service.cancelAgent(TEST_TASK_ID);

    expect(runner.cancel).toHaveBeenCalledTimes(1);
    expect(mocks.killProcessesForTask).toHaveBeenCalledWith(TEST_TASK_ID);
    expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, {
      status: 'canceled',
      error: 'Task canceled by user',
    });
    expect(mocks.sseEmitter.emitError).toHaveBeenCalledWith(
      TEST_TASK_ID,
      'Task canceled by user',
      'CANCELLED'
    );
    expect(service.isAgentRunning(TEST_TASK_ID)).toBe(false);
  });

  it('stores feedback when requesting changes and exposes it for resume', async () => {
    mocks.taskService.getById.mockReturnValue(buildTask({ status: 'pr_created', pr_url: 'https://github.com/acme/repo/pull/1' }));

    await service.requestChanges(TEST_TASK_ID, 'Please improve error handling');

    expect(mocks.taskService.update).toHaveBeenCalledWith(TEST_TASK_ID, {
      status: 'changes_requested',
      error: null,
    });
    expect(mocks.sseEmitter.emitStatus).toHaveBeenCalledWith(TEST_TASK_ID, 'changes_requested');

    const feedback = service.getPendingReviewFeedback(TEST_TASK_ID);
    expect(feedback).toBe('Please improve error handling');
    expect(service.getPendingReviewFeedback(TEST_TASK_ID)).toBeNull();
  });

  it('throws when requestChanges is called in invalid status', async () => {
    mocks.taskService.getById.mockReturnValue(buildTask({ status: 'awaiting_review' }));

    await expect(service.requestChanges(TEST_TASK_ID, 'msg')).rejects.toThrow(
      'Cannot request changes for task with status: awaiting_review'
    );
  });

  it('sends feedback to active runner and persists user message in chat history', () => {
    const runner = { cancel: vi.fn(), addFeedback: vi.fn(), run: vi.fn() };
    (service as any).activeAgents.set(TEST_TASK_ID, {
      taskId: TEST_TASK_ID,
      runner,
      promise: Promise.resolve({ success: true, iterations: 1 }),
      startedAt: new Date(),
      timeoutTimer: null,
      warningTimer: null,
      timeoutAt: new Date(Date.now() + 30_000),
      warningSent: false,
    });

    service.sendFeedback(TEST_TASK_ID, 'Add retries around API calls');

    expect(runner.addFeedback).toHaveBeenCalledWith('Add retries around API calls');
    const history = service.getChatHistory(TEST_TASK_ID);
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(
      expect.objectContaining({
        role: 'user',
        content: 'Add retries around API calls',
      })
    );
  });

  it('cleanupTaskWorktree only calls git cleanup when worktree exists', async () => {
    mocks.gitService.worktreeExists.mockResolvedValueOnce(false);
    await service.cleanupTaskWorktree(TEST_TASK_ID, 'test');
    expect(mocks.gitService.cleanupWorktree).not.toHaveBeenCalled();

    mocks.gitService.worktreeExists.mockResolvedValueOnce(true);
    await service.cleanupTaskWorktree(TEST_TASK_ID, 'test');
    expect(mocks.gitService.cleanupWorktree).toHaveBeenCalledWith(TEST_TASK_ID);
  });
});
