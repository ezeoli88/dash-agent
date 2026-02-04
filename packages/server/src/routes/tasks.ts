import { Router, Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';
import { taskService, type Task } from '../services/task.service.js';
import { getAgentService } from '../services/agent.service.js';
import { getGitService } from '../services/git.service.js';
import { getPRCommentsService } from '../services/pr-comments.service.js';
import { getSSEEmitter } from '../utils/sse-emitter.js';
import { CreateTaskSchema, UpdateTaskSchema, GenerateSpecRequestSchema, UpdateSpecRequestSchema, ApproveSpecRequestSchema } from '../schemas/task.schema.js';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { getGitHubClient } from '../github/client.js';
import { generateSpec, regenerateSpec } from '../services/pm-agent.service.js';
import { executeSpec, cancelExecution } from '../services/dev-agent.service.js';
import { getAICredentials } from '../services/secrets.service.js';

const logger = createLogger('routes:tasks');
const router = Router();

/**
 * UUID v4 regex pattern for validation.
 */
const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Formats Zod errors into a consistent response format.
 */
function formatZodError(error: ZodError) {
  return {
    error: 'Validation failed',
    details: error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

/**
 * Validates that a string is a valid UUID format.
 */
function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Gets AI provider configuration from secrets service or request headers (fallback).
 */
function getAIConfig(_req: Request): { provider: 'claude' | 'openai' | 'openrouter'; apiKey: string; model?: string } | null {
  // First, try to get from secrets service (preferred)
  const credentials = getAICredentials();
  if (credentials) {
    logger.debug('Using AI credentials from secrets service', { provider: credentials.provider });
    return credentials;
  }

  // Fallback to headers (for backwards compatibility)
  const provider = _req.headers['x-ai-provider'] as string | undefined;
  const apiKey = _req.headers['x-ai-api-key'] as string | undefined;

  if (!provider || !apiKey) {
    return null;
  }

  if (provider !== 'claude' && provider !== 'openai' && provider !== 'openrouter') {
    return null;
  }

  return { provider, apiKey };
}

// =============================================================================
// Middlewares
// =============================================================================

/**
 * Extended Request interface with task attached by loadTask middleware.
 */
interface RequestWithTask extends Request {
  task: Task;
}

/**
 * Middleware that validates req.params.id exists and is a valid UUID.
 * Returns 400 if the ID is missing or invalid.
 */
function requireTaskId(req: Request, res: Response, next: NextFunction): void {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'Task ID is required' });
    return;
  }
  if (!isValidUUID(id)) {
    res.status(400).json({
      error: 'Invalid task ID format',
      message: 'Task ID must be a valid UUID',
    });
    return;
  }
  next();
}

/**
 * Middleware that loads a task by ID and attaches it to the request.
 * Returns 404 if the task doesn't exist.
 * Must be used after requireTaskId.
 */
function loadTask(req: Request, res: Response, next: NextFunction): void {
  const { id } = req.params;
  const task = taskService.getById(id!);
  if (task === null) {
    res.status(404).json({ error: 'Task not found', id });
    return;
  }
  (req as RequestWithTask).task = task;
  next();
}

// =============================================================================
// CRUD Endpoints
// =============================================================================

/**
 * POST /tasks - Create a new task
 *
 * Supports both legacy workflow and new two-agent workflow.
 * For two-agent workflow, provide repository_id and user_input.
 */
router.post('/', (req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.debug('POST /tasks', { body: req.body });

    const result = CreateTaskSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(formatZodError(result.error));
      return;
    }

    const task = taskService.create(result.data);
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks - List all tasks
 *
 * Optional query params:
 * - repository_id: Filter by repository
 */
router.get('/', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const repositoryId = req.query.repository_id as string | undefined;
    logger.debug('GET /tasks', { repositoryId });
    const tasks = taskService.getAll(repositoryId);
    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/:id - Get a task by ID
 */
router.get('/:id', requireTaskId, loadTask, (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { task } = req as RequestWithTask;
    logger.debug('GET /tasks/:id', { id: task.id });
    res.json(task);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /tasks/:id - Update a task
 */
router.patch('/:id', requireTaskId, (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    logger.debug('PATCH /tasks/:id', { id, body: req.body });

    const result = UpdateTaskSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(formatZodError(result.error));
      return;
    }

    const task = taskService.update(id!, result.data);
    if (task === null) {
      res.status(404).json({ error: 'Task not found', id });
      return;
    }

    res.json(task);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /tasks/:id - Delete a task
 *
 * This endpoint also cleans up the worktree associated with the task.
 */
router.delete('/:id', requireTaskId, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    logger.debug('DELETE /tasks/:id', { id });

    // Check if task exists first
    const task = taskService.getById(id!);
    if (!task) {
      res.status(404).json({ error: 'Task not found', id });
      return;
    }

    // Check if agent is running - cancel it first
    const agentService = getAgentService();
    if (agentService.isAgentRunning(id!)) {
      logger.info('Cancelling running agent before deleting task', { id });
      agentService.cancelAgent(id!);
    }

    // Clean up the worktree (if it exists)
    // Don't fail deletion if worktree cleanup fails - just log the error
    try {
      await agentService.cleanupTaskWorktree(id!, 'task deleted');
    } catch (cleanupError) {
      logger.warn('Failed to cleanup worktree during task deletion, continuing with deletion', {
        id,
        error: getErrorMessage(cleanupError),
      });
    }

    // Delete the task
    const deleted = taskService.delete(id!);
    if (!deleted) {
      // This shouldn't happen since we checked above, but handle it anyway
      res.status(404).json({ error: 'Task not found', id });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// Two-Agent Workflow Endpoints
// =============================================================================

/**
 * POST /tasks/:id/generate-spec - PM Agent generates spec from user input
 *
 * Requires AI provider configuration in headers:
 * - X-AI-Provider: 'claude' or 'openai'
 * - X-AI-API-Key: The API key for the provider
 *
 * Valid for tasks with status: 'draft'
 */
router.post('/:id/generate-spec', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/generate-spec', { id, status: task.status });

    // Validate task status
    if (task.status !== 'draft') {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot generate spec for task with status: ${task.status}. Expected: draft`,
      });
      return;
    }

    // Get AI config from headers
    const aiConfig = getAIConfig(req);
    if (!aiConfig) {
      res.status(400).json({
        error: 'Missing AI configuration',
        message: 'Please provide X-AI-Provider and X-AI-API-Key headers',
      });
      return;
    }

    // Parse optional request body
    const bodyResult = GenerateSpecRequestSchema.safeParse(req.body || {});
    const additionalContext = bodyResult.success ? bodyResult.data.additional_context : undefined;

    // Generate spec asynchronously and return immediately
    // The PM Agent will emit SSE events as it works
    generateSpec(
      additionalContext
        ? { task_id: id!, additional_context: additionalContext }
        : { task_id: id! },
      aiConfig
    )
      .then((result) => {
        logger.info('PM Agent completed', { taskId: id, tokens: result.tokens_used });
      })
      .catch((error) => {
        logger.error('PM Agent failed', { taskId: id, error: getErrorMessage(error) });
      });

    res.status(202).json({
      status: 'generating',
      message: 'PM Agent is generating the specification. Check task status for updates.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/regenerate-spec - Regenerate the spec with different approach
 *
 * Valid for tasks with status: 'pending_approval'
 */
router.post('/:id/regenerate-spec', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/regenerate-spec', { id, status: task.status });

    // Validate task status
    if (task.status !== 'pending_approval') {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot regenerate spec for task with status: ${task.status}. Expected: pending_approval`,
      });
      return;
    }

    // Get AI config from headers
    const aiConfig = getAIConfig(req);
    if (!aiConfig) {
      res.status(400).json({
        error: 'Missing AI configuration',
        message: 'Please provide X-AI-Provider and X-AI-API-Key headers',
      });
      return;
    }

    // Parse optional request body for additional context
    const bodyResult = GenerateSpecRequestSchema.safeParse(req.body || {});
    const additionalContext = bodyResult.success ? bodyResult.data.additional_context : undefined;

    // Regenerate spec asynchronously
    regenerateSpec(id!, aiConfig, additionalContext)
      .then((result) => {
        logger.info('PM Agent regeneration completed', { taskId: id, tokens: result.tokens_used });
      })
      .catch((error) => {
        logger.error('PM Agent regeneration failed', { taskId: id, error: getErrorMessage(error) });
      });

    res.status(202).json({
      status: 'regenerating',
      message: 'PM Agent is regenerating the specification.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /tasks/:id/spec - User edits the spec
 *
 * Valid for tasks with status: 'pending_approval'
 */
router.patch('/:id/spec', requireTaskId, loadTask, (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('PATCH /tasks/:id/spec', { id, status: task.status });

    // Validate task status
    if (task.status !== 'pending_approval') {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot edit spec for task with status: ${task.status}. Expected: pending_approval`,
      });
      return;
    }

    // Parse request body
    const result = UpdateSpecRequestSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(formatZodError(result.error));
      return;
    }

    // Update the spec (marks as user-edited)
    const updatedTask = taskService.updateSpec(id!, result.data.spec, false);
    if (!updatedTask) {
      res.status(500).json({ error: 'Failed to update spec' });
      return;
    }

    res.json(updatedTask);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/approve-spec - Approve the spec and start Dev Agent
 *
 * Valid for tasks with status: 'pending_approval'
 */
router.post('/:id/approve-spec', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/approve-spec', { id, status: task.status });

    // Validate task status
    if (task.status !== 'pending_approval') {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot approve spec for task with status: ${task.status}. Expected: pending_approval`,
      });
      return;
    }

    // Parse optional request body
    const bodyResult = ApproveSpecRequestSchema.safeParse(req.body || {});
    const finalSpec = bodyResult.success ? bodyResult.data.final_spec : undefined;

    // Approve the spec
    const approvedTask = taskService.approveSpec(id!, finalSpec);
    if (!approvedTask) {
      res.status(500).json({ error: 'Failed to approve spec' });
      return;
    }

    // Emit SSE status update
    const sseEmitter = getSSEEmitter();
    sseEmitter.emitStatus(id!, 'approved');
    sseEmitter.emitLog(id!, 'info', 'Spec approved! Dev Agent will start working...');

    // Start the Dev Agent
    try {
      await executeSpec({ task_id: id! });
    } catch (execError) {
      const errorMsg = getErrorMessage(execError);
      logger.error('Failed to start Dev Agent after spec approval', { id, error: errorMsg });
      // Don't fail the approval, just log the error
      // The task will remain in 'approved' status and can be manually started
    }

    res.json({
      status: 'approved',
      task_status: approvedTask.status,
      message: 'Spec approved. Dev Agent has started working.',
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// Agent Execution Endpoints (Legacy + Updated)
// =============================================================================

/**
 * POST /tasks/:id/execute - Start the agent for a task
 *
 * Accepts tasks with status:
 * - 'backlog': Initial execution (legacy workflow)
 * - 'approved': Start Dev Agent (new workflow)
 * - 'failed': Retry after failure
 * - 'changes_requested': Resume to address reviewer feedback
 */
router.post('/:id/execute', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/execute', { id, status: task.status });

    // Check if task can be executed
    const validStatuses = ['backlog', 'approved', 'failed', 'changes_requested'];
    if (!validStatuses.includes(task.status)) {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot execute task with status: ${task.status}. Valid statuses: ${validStatuses.join(', ')}`,
      });
      return;
    }

    // Check for conflicting tasks on same repo
    const agentService = getAgentService();
    const activeAgents = agentService.getActiveAgents();
    const conflictingTask = activeAgents.find((a) => {
      const t = taskService.getById(a.taskId);
      return t && t.repo_url === task.repo_url && t.id !== id;
    });

    if (conflictingTask) {
      res.status(409).json({
        error: 'Another task is already in progress for this repository',
        conflicting_task_id: conflictingTask.taskId,
      });
      return;
    }

    // Determine if this is a resume from changes_requested
    const isResume = task.status === 'changes_requested';

    // For new workflow tasks with 'approved' status, use Dev Agent
    if (task.status === 'approved') {
      try {
        await executeSpec({ task_id: id! });
        res.status(202).json({
          status: 'started',
          task_status: 'coding',
          message: 'Dev Agent started working on the spec',
        });
        return;
      } catch (execError) {
        next(execError);
        return;
      }
    }

    // Update status to 'planning' SYNCHRONOUSLY before responding
    // This ensures:
    // 1. The frontend receives the updated status and can show logs (SSE connects on planning/in_progress)
    // 2. The Execute button is disabled immediately
    const updatedTask = taskService.update(id!, { status: 'planning' });
    if (!updatedTask) {
      res.status(500).json({ error: 'Failed to update task status' });
      return;
    }

    // Emit SSE event for status change so frontend updates immediately
    const sseEmitter = getSSEEmitter();
    sseEmitter.emitStatus(id!, 'planning');

    logger.info('Task status updated to planning', { taskId: id });

    // Start the agent asynchronously (don't await completion)
    agentService.startAgent(id!, isResume).catch((error) => {
      const errorMsg = getErrorMessage(error);
      logger.error('Agent execution failed', {
        taskId: id,
        error: errorMsg,
      });

      // Ensure task status is updated to failed (backup in case startAgent's catch didn't run)
      const currentTask = taskService.getById(id!);
      if (currentTask && currentTask.status !== 'failed') {
        taskService.update(id!, {
          status: 'failed',
          error: errorMsg,
        });
        sseEmitter.emitStatus(id!, 'failed');
        sseEmitter.emitError(id!, errorMsg);
      }
    });

    res.status(202).json({
      status: 'started',
      task_status: 'planning',
      message: isResume
        ? 'Agent resumed to address requested changes'
        : 'Agent execution started',
      resume_mode: isResume,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/feedback - Send feedback to the agent during execution
 */
router.post('/:id/feedback', requireTaskId, (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;

    const FeedbackSchema = z.object({
      message: z.string().min(1, 'Message is required'),
    });

    const result = FeedbackSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(formatZodError(result.error));
      return;
    }

    logger.info('POST /tasks/:id/feedback', { id, message: result.data.message });

    const agentService = getAgentService();

    if (!agentService.isAgentRunning(id!)) {
      res.status(400).json({
        error: 'No active agent',
        message: 'No agent is currently running for this task',
      });
      return;
    }

    agentService.sendFeedback(id!, result.data.message);

    res.json({ status: 'feedback_sent' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/extend - Extend the agent timeout by 5 minutes
 */
router.post('/:id/extend', requireTaskId, loadTask, (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    logger.info('POST /tasks/:id/extend', { id });

    const agentService = getAgentService();

    if (!agentService.isAgentRunning(id!)) {
      res.status(400).json({
        error: 'No active agent',
        message: 'No agent is currently running for this task',
      });
      return;
    }

    const newTimeout = agentService.extendTimeout(id!);

    res.json({
      status: 'extended',
      new_timeout: newTimeout.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/cancel - Cancel the agent execution
 */
router.post('/:id/cancel', requireTaskId, loadTask, (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/cancel', { id });

    const agentService = getAgentService();

    // Handle cancellation for PM Agent (refining status)
    if (task.status === 'refining') {
      // PM Agent doesn't run in a separate process, just update status
      taskService.update(id!, { status: 'draft', error: 'Spec generation cancelled' });

      const sseEmitter = getSSEEmitter();
      sseEmitter.emitStatus(id!, 'draft');
      sseEmitter.emitError(id!, 'Spec generation cancelled by user');

      res.json({ status: 'cancelled' });
      return;
    }

    // For Dev Agent / legacy agent
    if (!agentService.isAgentRunning(id!)) {
      res.status(400).json({
        error: 'No active agent',
        message: 'No agent is currently running for this task',
      });
      return;
    }

    agentService.cancelAgent(id!);

    res.json({ status: 'cancelled' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/approve - Approve changes and create PR
 */
router.post('/:id/approve', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/approve', { id });

    // Validate task status (support both legacy and new workflow)
    if (task.status !== 'awaiting_review' && task.status !== 'review') {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot approve task with status: ${task.status}. Expected: awaiting_review or review`,
      });
      return;
    }

    const agentService = getAgentService();
    const prUrl = await agentService.approveAndCreatePR(id!);

    res.json({
      status: 'approved',
      pr_url: prUrl,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/request-changes - Request changes on a PR
 *
 * When a reviewer requests changes on a PR, this endpoint:
 * - Validates the task is in 'pr_created' or 'review' status
 * - Changes status to 'changes_requested'
 * - Stores the reviewer feedback for the agent
 *
 * After calling this, call POST /tasks/:id/execute to resume the agent.
 */
router.post('/:id/request-changes', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/request-changes', { id });

    // Validate request body
    const RequestChangesSchema = z.object({
      feedback: z.string().min(1, 'Feedback is required'),
    });

    const result = RequestChangesSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(formatZodError(result.error));
      return;
    }

    // Validate task status (support both legacy and new workflow)
    if (task.status !== 'pr_created' && task.status !== 'review') {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot request changes for task with status: ${task.status}. Expected: pr_created or review`,
      });
      return;
    }

    const agentService = getAgentService();
    await agentService.requestChanges(id!, result.data.feedback);

    res.json({
      status: 'changes_requested',
      message: 'Changes requested. Call POST /tasks/:id/execute to resume the agent.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/pr-merged - Mark PR as merged
 *
 * Call this when the PR is merged on GitHub to:
 * - Update task status to 'done'
 * - Clean up the worktree
 */
router.post('/:id/pr-merged', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/pr-merged', { id });

    // Validate task status (support both legacy and new workflow)
    if (task.status !== 'pr_created' && task.status !== 'review') {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot mark PR as merged for task with status: ${task.status}. Expected: pr_created or review`,
      });
      return;
    }

    const agentService = getAgentService();
    await agentService.markPRMerged(id!);

    res.json({
      status: 'done',
      message: 'PR marked as merged. Worktree cleaned up.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/pr-closed - Mark PR as closed (not merged)
 *
 * Call this when the PR is closed without merging to:
 * - Update task status to 'failed'
 * - Clean up the worktree
 */
router.post('/:id/pr-closed', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/pr-closed', { id });

    // Validate task status (support both legacy and new workflow)
    if (!['pr_created', 'review', 'changes_requested'].includes(task.status)) {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot mark PR as closed for task with status: ${task.status}. Expected: pr_created, review, or changes_requested`,
      });
      return;
    }

    const agentService = getAgentService();
    await agentService.markPRClosed(id!);

    res.json({
      status: 'failed',
      message: 'PR marked as closed. Worktree cleaned up.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/cleanup-worktree - Explicitly clean up the task's worktree
 *
 * Use this endpoint to manually clean up the worktree for a task.
 * This is typically called when:
 * - You want to start fresh (discarding all previous agent work)
 * - The worktree is in an inconsistent state
 *
 * Note: Worktrees are automatically cleaned up when:
 * - PR is merged (via /pr-merged)
 * - PR is closed (via /pr-closed)
 * - Task is deleted (via DELETE /tasks/:id)
 */
router.post('/:id/cleanup-worktree', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/cleanup-worktree', { id });

    // Don't allow cleanup while agent is running
    const agentService = getAgentService();
    if (agentService.isAgentRunning(id!)) {
      res.status(400).json({
        error: 'Agent is running',
        message: 'Cannot clean up worktree while agent is running. Cancel the agent first.',
      });
      return;
    }

    // Check if worktree exists
    const gitService = getGitService();
    const worktreeExists = await gitService.worktreeExists(id!);

    if (!worktreeExists) {
      res.json({
        status: 'no_worktree',
        message: 'No worktree exists for this task',
      });
      return;
    }

    // Perform cleanup with explicit error handling
    try {
      await agentService.cleanupTaskWorktree(id!, 'manual cleanup requested');
    } catch (cleanupError) {
      const errorMessage = getErrorMessage(cleanupError);
      logger.error('Cleanup worktree failed', { id, error: errorMessage });

      // Return a user-friendly error with recovery instructions
      res.status(500).json({
        error: 'Cleanup failed',
        message: errorMessage,
        recovery_steps: [
          'Close any file explorers or IDEs that have the worktree directory open',
          'Check if an antivirus is scanning the directory',
          'Wait a few seconds and try again',
          'If the problem persists, manually delete the worktree directory',
        ],
      });
      return;
    }

    res.json({
      status: 'cleaned',
      message: 'Worktree has been cleaned up. Next execution will start fresh.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/:id/logs - Stream SSE of logs in real-time
 *
 * This endpoint returns a Server-Sent Events stream.
 * Events: log, status, timeout_warning, awaiting_review, complete, error
 */
router.get('/:id/logs', requireTaskId, loadTask, (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('GET /tasks/:id/logs (SSE)', { id });

    // Get SSE emitter and register client
    const sseEmitter = getSSEEmitter();
    const clientId = sseEmitter.addClient(id!, res);

    logger.debug('SSE client connected', { taskId: id, clientId });

    // Send historical logs first
    const agentService = getAgentService();
    const historicalLogs = agentService.getAgentLogs(id!);

    for (const log of historicalLogs) {
      const eventString = `event: log\ndata: ${JSON.stringify(log)}\n\n`;
      res.write(eventString);
    }

    // Send current task status
    const statusEvent = `event: status\ndata: ${JSON.stringify({ status: task.status })}\n\n`;
    res.write(statusEvent);

    // If agent is running, send timeout info
    const timeoutInfo = agentService.getTimeoutInfo(id!);
    if (timeoutInfo) {
      const timeoutEvent = `event: log\ndata: ${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Agent running since ${timeoutInfo.startedAt.toISOString()}, timeout at ${timeoutInfo.timeoutAt.toISOString()}`,
      })}\n\n`;
      res.write(timeoutEvent);
    }

    // If task is in a terminal state, send appropriate event and close connection
    if (task.status === 'done' && task.pr_url) {
      const completeEvent = `event: complete\ndata: ${JSON.stringify({ pr_url: task.pr_url })}\n\n`;
      res.write(completeEvent);
      res.end();
      return;
    } else if (task.status === 'failed') {
      const errorEvent = `event: error\ndata: ${JSON.stringify({ message: task.error || 'Task failed' })}\n\n`;
      res.write(errorEvent);
      res.end();
      return;
    } else if (task.status === 'awaiting_review' || task.status === 'review') {
      const reviewEvent = `event: awaiting_review\ndata: ${JSON.stringify({
        message: 'Agent completed. Review changes before creating PR.',
      })}\n\n`;
      res.write(reviewEvent);
      // Don't close - user may want to monitor while reviewing
    } else if (task.status === 'pending_approval') {
      const pendingEvent = `event: log\ndata: ${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Spec is ready for review. Please review and approve or edit.',
      })}\n\n`;
      res.write(pendingEvent);
    }

    // Keep connection alive with periodic heartbeat (every 15s)
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (error) {
        logger.debug('Heartbeat write failed, clearing interval', { taskId: id, error: getErrorMessage(error) });
        clearInterval(heartbeatInterval);
      }
    }, 15000);

    // Clean up on close
    res.on('close', () => {
      clearInterval(heartbeatInterval);
      logger.debug('SSE client disconnected', { taskId: id, clientId });
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/:id/changes - Get files modified by the agent
 */
router.get('/:id/changes', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.debug('GET /tasks/:id/changes', { id, targetBranch: task.target_branch });

    // Check if task has a worktree
    const gitService = getGitService();
    const workspacePath = gitService.getWorktreePath(id!);

    if (!workspacePath) {
      res.status(400).json({
        error: 'No worktree',
        message: 'No worktree exists for this task. The agent may not have started yet.',
      });
      return;
    }

    // Get changed files and diff, comparing against the task's target branch
    const [files, diff] = await Promise.all([
      gitService.getChangedFiles(workspacePath, task.target_branch),
      gitService.getDiff(workspacePath),
    ]);

    res.json({
      files: files.map((f) => ({
        path: f.path,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        oldContent: f.oldContent,
        newContent: f.newContent,
      })),
      diff,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/:id/pr-comments - Get PR comments for a task
 *
 * Returns all comments on the PR associated with this task.
 * Only works for tasks with status 'pr_created', 'review', or 'changes_requested'.
 */
router.get('/:id/pr-comments', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.debug('GET /tasks/:id/pr-comments', { id });

    // Validate task has a PR
    if (!task.pr_url) {
      res.status(400).json({
        error: 'No PR',
        message: 'This task does not have an associated pull request.',
      });
      return;
    }

    // Extract PR number from URL
    const prMatch = task.pr_url.match(/\/pull\/(\d+)/);
    if (!prMatch || !prMatch[1]) {
      res.status(400).json({
        error: 'Invalid PR URL',
        message: 'Could not extract PR number from the PR URL.',
      });
      return;
    }

    const prNumber = parseInt(prMatch[1], 10);

    // Get comments from GitHub
    const githubClient = getGitHubClient();
    const comments = await githubClient.getPullRequestComments(task.repo_url, prNumber);

    res.json({
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        author: {
          login: c.author.login,
          avatarUrl: c.author.avatarUrl,
        },
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        url: c.url,
        isReviewComment: c.isReviewComment,
        path: c.path,
        line: c.line,
      })),
      totalCount: comments.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
