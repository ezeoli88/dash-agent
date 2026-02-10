import { Router, Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';
import { taskService, type Task } from '../services/task.service.js';
import { getAgentService } from '../services/agent.service.js';
import { getGitService, execGitOrThrow } from '../services/git.service.js';
import { getPRCommentsService } from '../services/pr-comments.service.js';
import { getSSEEmitter } from '../utils/sse-emitter.js';
import { CreateTaskSchema, UpdateTaskSchema, GenerateSpecRequestSchema, UpdateSpecRequestSchema, ApproveSpecRequestSchema } from '../schemas/task.schema.js';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { getGitHubClient } from '../github/client.js';
import { generateSpec, regenerateSpec, cancelSpecGeneration } from '../services/pm-agent.service.js';
import { executeSpec, cancelExecution } from '../services/dev-agent.service.js';
import { getAICredentials } from '../services/secrets.service.js';
import { spawn } from 'child_process';

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

    // Delete the task first (fast, synchronous DB operation)
    const deleted = taskService.delete(id!);

    // Clean up the worktree in background (can be slow on Windows)
    // Don't block the HTTP response — fire and forget
    agentService.cleanupTaskWorktree(id!, 'task deleted').catch((cleanupError) => {
      logger.warn('Failed to cleanup worktree during task deletion', {
        id,
        error: getErrorMessage(cleanupError),
      });
    });
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

    // Get AI config from stored credentials (fallback if task has no agent_type)
    const aiConfig = getAIConfig(req) ?? undefined;

    // Parse optional request body
    const bodyResult = GenerateSpecRequestSchema.safeParse(req.body || {});
    const additionalContext = bodyResult.success ? bodyResult.data.additional_context : undefined;

    logger.info('Spec generation requested', {
      taskId: id,
      taskAgentType: task.agent_type,
      taskAgentModel: task.agent_model,
      fallbackProvider: aiConfig?.provider ?? 'none',
    });

    // Generate spec asynchronously and return immediately
    // Priority: task agent_type/agent_model -> default CLI agent -> stored API credentials
    generateSpec(
      additionalContext
        ? { task_id: id!, additional_context: additionalContext }
        : { task_id: id! },
      aiConfig
    )
      .then((result) => {
        logger.info('PM Agent completed', { taskId: id, model: result.model_used, tokens: result.tokens_used });
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

    // Get AI config from stored credentials (fallback if task has no agent_type)
    const aiConfig = getAIConfig(req) ?? undefined;

    // Parse optional request body for additional context
    const bodyResult = GenerateSpecRequestSchema.safeParse(req.body || {});
    const additionalContext = bodyResult.success ? bodyResult.data.additional_context : undefined;

    logger.info('Spec regeneration requested', {
      taskId: id,
      taskAgentType: task.agent_type,
      taskAgentModel: task.agent_model,
      fallbackProvider: aiConfig?.provider ?? 'none',
    });

    // Regenerate spec asynchronously
    // Priority: task agent_type/agent_model -> default CLI agent -> stored API credentials
    regenerateSpec(id!, aiConfig, additionalContext)
      .then((result) => {
        logger.info('PM Agent regeneration completed', { taskId: id, model: result.model_used, tokens: result.tokens_used });
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
// Plan Approval Endpoints
// =============================================================================

/**
 * POST /tasks/:id/approve-plan - Approve the implementation plan and start coding
 *
 * After the agent creates a plan (plan_review status), the user reviews it
 * in the chat and clicks "Approve Plan". This endpoint:
 * - Validates the task is in 'plan_review' status
 * - Retrieves the stored plan
 * - Starts the agent again in implementation mode with the approved plan
 */
router.post('/:id/approve-plan', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/approve-plan', { id, status: task.status });

    // Validate task status
    if (task.status !== 'plan_review') {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot approve plan for task with status: ${task.status}. Expected: plan_review`,
      });
      return;
    }

    const agentService = getAgentService();

    // Approve plan and start implementation (async)
    agentService.approvePlan(id!).catch((error) => {
      logger.error('Failed to approve plan and start implementation', { taskId: id, error: getErrorMessage(error) });
    });

    res.json({
      status: 'approved',
      message: 'Plan approved. Agent is implementing...',
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// Agent Execution Endpoints (Legacy + Updated)
// =============================================================================

/**
 * POST /tasks/:id/start - Start task execution directly (chat mode)
 * Replaces the old generate-spec -> approve-spec -> execute flow.
 * Creates a branch and starts the agent in one step.
 */
router.post('/:id/start', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/start', { id, status: task.status });

    // Validate status
    if (!['draft', 'failed'].includes(task.status)) {
      res.status(400).json({
        error: 'Invalid status',
        message: `Cannot start task with status: ${task.status}. Expected: draft or failed`,
      });
      return;
    }

    // Generate branch name
    const titleSlug = task.title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 40);
    const taskSuffix = id!.substring(0, 8);
    const branchName = `feature/${titleSlug}-${taskSuffix}`;

    // Clear error on retry from failed
    const isRetry = task.status === 'failed';

    // Update task with branch and set to planning
    taskService.update(id!, {
      branch_name: branchName,
      status: 'planning',
      error: isRetry ? null : undefined,
    });

    // Emit status change
    const sseEmitter = getSSEEmitter();
    sseEmitter.emitStatus(id!, 'planning');

    // Start agent execution asynchronously
    const agentService = getAgentService();
    agentService.startAgent(id!, false).catch((error) => {
      logger.error('Failed to start agent', { taskId: id, error: getErrorMessage(error) });
      const currentTask = taskService.getById(id!);
      if (currentTask && currentTask.status !== 'failed') {
        taskService.update(id!, { status: 'failed', error: getErrorMessage(error) });
        sseEmitter.emitStatus(id!, 'failed');
        sseEmitter.emitError(id!, getErrorMessage(error));
      }
    });

    res.json({ status: 'started', message: 'Agent started' });
  } catch (error) {
    next(error);
  }
});

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

    // Determine if this is a resume from changes_requested
    const agentService = getAgentService();
    const isResume = task.status === 'changes_requested';
    const isRetry = task.status === 'failed';

    // Clear error on retry
    if (isRetry) {
      taskService.update(id!, { error: null });
    }

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
    // Also clear error on retry
    const updatedTask = taskService.update(id!, { status: 'planning', error: isRetry ? null : undefined });
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
 * POST /tasks/:id/feedback - Send feedback to the agent during execution.
 * If no agent is running, resumes the agent with the message as context.
 */
router.post('/:id/feedback', requireTaskId, loadTask, (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { task } = req as RequestWithTask;
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

    // If agent is running, send feedback directly
    if (agentService.isAgentRunning(id!)) {
      agentService.sendFeedback(id!, result.data.message);
      res.json({ status: 'feedback_sent' });
      return;
    }

    // Agent is NOT running — resume the agent with the user's message
    // Only allow for non-terminal, non-draft statuses
    const terminalStatuses = ['done', 'failed', 'draft'];
    if (terminalStatuses.includes(task.status)) {
      res.status(400).json({
        error: 'Cannot send feedback',
        message: `Task is in ${task.status} status. Cannot resume the agent.`,
      });
      return;
    }

    // plan_review: user is approving the plan via chat message
    if (task.status === 'plan_review') {
      logger.info('Plan review chat approval', { id, message: result.data.message });

      // Store the user message in chat history
      agentService.addUserMessageToHistory(id!, result.data.message);

      // Approve plan and start implementation
      agentService.approvePlan(id!).catch((error) => {
        logger.error('Failed to approve plan from chat', { taskId: id, error: getErrorMessage(error) });
        const currentTask = taskService.getById(id!);
        if (currentTask && currentTask.status !== 'failed') {
          taskService.update(id!, { status: 'failed', error: getErrorMessage(error) });
          const sseEmitter = getSSEEmitter();
          sseEmitter.emitStatus(id!, 'failed');
          sseEmitter.emitError(id!, getErrorMessage(error));
        }
      });

      res.json({ status: 'plan_approved', message: 'Plan approved. Agent is implementing...' });
      return;
    }

    logger.info('No active agent, resuming with user message', { id, status: task.status });

    // Store the user message in chat history so it persists across SSE reconnections
    agentService.addUserMessageToHistory(id!, result.data.message);

    // Store the message as review feedback and resume the agent
    agentService.storeFeedbackForResume(id!, result.data.message);

    // Update status to planning so startAgent accepts it
    taskService.update(id!, { status: 'planning' });
    const sseEmitter = getSSEEmitter();
    sseEmitter.emitStatus(id!, 'planning');

    // Start agent asynchronously with resume=true
    agentService.startAgent(id!, true).catch((error) => {
      logger.error('Failed to resume agent from feedback', { taskId: id, error: getErrorMessage(error) });
      const currentTask = taskService.getById(id!);
      if (currentTask && currentTask.status !== 'failed') {
        taskService.update(id!, { status: 'failed', error: getErrorMessage(error) });
        sseEmitter.emitStatus(id!, 'failed');
        sseEmitter.emitError(id!, getErrorMessage(error));
      }
    });

    res.json({ status: 'agent_resumed', message: 'Agent resumed with your message' });
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
      // Kill the PM Agent CLI process if running
      cancelSpecGeneration(id!);
      taskService.update(id!, { status: 'draft', error: 'Spec generation cancelled' });

      const sseEmitter = getSSEEmitter();
      sseEmitter.emitStatus(id!, 'draft');
      sseEmitter.emitError(id!, 'Spec generation cancelled by user');

      res.json({ status: 'cancelled' });
      return;
    }

    // For Dev Agent / legacy agent
    if (!agentService.isAgentRunning(id!)) {
      // Agent process already exited but task is stuck in an active status.
      // Reset to failed so the user can retry.
      const activeStatuses = ['planning', 'in_progress', 'coding', 'plan_review', 'approved', 'awaiting_review'];
      if (activeStatuses.includes(task.status)) {
        logger.info('No active agent but task is stuck in active status, resetting', { id, status: task.status });
        taskService.update(id!, { status: 'canceled', error: 'Task canceled by user (agent not running)' });
        const sseEmitter = getSSEEmitter();
        sseEmitter.emitStatus(id!, 'canceled');
        res.json({ status: 'cancelled' });
        return;
      }
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
 * - Update task status to 'canceled'
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
      status: 'canceled',
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

    // Send chat history for replay
    const chatHistory = agentService.getChatHistory(id!);
    for (const event of chatHistory) {
      const eventType = 'role' in event ? 'chat_message' : 'tool_activity';
      const eventString = `event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`;
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
    if (task.status === 'done') {
      const completeEvent = `event: complete\ndata: ${JSON.stringify({ pr_url: task.pr_url ?? '' })}\n\n`;
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
    } else if (task.status === 'plan_review') {
      const planReviewEvent = `event: awaiting_review\ndata: ${JSON.stringify({
        message: 'Plan created. Review the plan and approve to start implementation.',
      })}\n\n`;
      res.write(planReviewEvent);
      // Don't close - user needs to review plan in chat
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
 * GET /tasks/:id/changes - Get files modified by the agent.
 * First tries the live worktree, then falls back to persisted changes_data in DB.
 */
router.get('/:id/changes', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.debug('GET /tasks/:id/changes', { id, targetBranch: task.target_branch });

    // Try live worktree first
    const gitService = getGitService();
    const workspacePath = gitService.getWorktreePath(id!);

    if (workspacePath) {
      const [files, diff] = await Promise.all([
        gitService.getChangedFiles(workspacePath, task.target_branch),
        gitService.getDiff(workspacePath, task.target_branch),
      ]);

      logger.info('Serving changes from live worktree', {
        taskId: id,
        fileCount: files.length,
        filesWithContent: files.filter(f => f.oldContent !== undefined || f.newContent !== undefined).length,
        diffLength: diff.length,
      });

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
      return;
    }

    // Fallback to persisted changes data in DB
    if (task.changes_data) {
      try {
        logger.info('Serving changes from persisted data', {
          taskId: id,
          dataSize: task.changes_data.length,
        });
        const parsed = JSON.parse(task.changes_data);
        res.json(parsed);
        return;
      } catch {
        logger.warn('Failed to parse persisted changes_data', { id });
      }
    }

    logger.warn('No changes data available', {
      taskId: id,
      hasWorktree: !!workspacePath,
      hasPersistedData: !!task.changes_data,
    });

    res.status(400).json({
      error: 'No changes available',
      message: 'No worktree or persisted changes found for this task.',
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// Merge Conflict Resolution Endpoints
// =============================================================================

/**
 * POST /tasks/:id/open-editor - Open VS Code at the worktree path
 *
 * Opens the worktree directory in VS Code so the user can resolve merge conflicts.
 * Only valid for tasks with status: 'merge_conflicts'
 */
router.post('/:id/open-editor', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/open-editor', { id });

    // Validate task status
    if (task.status !== 'merge_conflicts') {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot open editor for task with status: ${task.status}. Expected: merge_conflicts`,
      });
      return;
    }

    // Get worktree path
    const gitService = getGitService();
    const worktreePath = gitService.getWorktreePath(id!);
    if (!worktreePath) {
      res.status(400).json({
        error: 'No worktree',
        message: 'No worktree found for this task.',
      });
      return;
    }

    // Open VS Code (fire-and-forget)
    const child = spawn('code', [worktreePath], {
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    child.unref();

    logger.info('VS Code opened for merge conflict resolution', { id, worktreePath });

    res.json({ opened: true, path: worktreePath });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/resolve-conflicts - Mark conflicts as resolved and continue PR creation
 *
 * Called when the user finishes resolving merge conflicts in VS Code.
 * Validates that no conflict markers remain, completes the merge commit,
 * then pushes and creates the PR.
 *
 * Only valid for tasks with status: 'merge_conflicts'
 */
router.post('/:id/resolve-conflicts', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/resolve-conflicts', { id });

    // Validate task status
    if (task.status !== 'merge_conflicts') {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot resolve conflicts for task with status: ${task.status}. Expected: merge_conflicts`,
      });
      return;
    }

    // Get worktree path
    const gitService = getGitService();
    const worktreePath = gitService.getWorktreePath(id!);
    if (!worktreePath) {
      res.status(400).json({
        error: 'No worktree',
        message: 'No worktree found for this task.',
      });
      return;
    }

    // Parse the list of conflict files from the task
    let conflictFileList: string[] = [];
    if (task.conflict_files) {
      try {
        conflictFileList = JSON.parse(task.conflict_files);
      } catch {
        // If parsing fails, check all files via git
      }
    }

    // If no files from task, check git for any remaining conflicts
    if (conflictFileList.length === 0) {
      conflictFileList = await gitService.getConflictingFiles(worktreePath);
    }

    // Check for remaining conflict markers
    const filesWithMarkers = await gitService.hasConflictMarkers(worktreePath, conflictFileList);
    if (filesWithMarkers.length > 0) {
      res.status(409).json({
        error: 'Aún hay archivos con conflictos',
        files: filesWithMarkers,
      });
      return;
    }

    const sseEmitter = getSSEEmitter();

    // Stage all changes and complete the merge commit
    try {
      await execGitOrThrow(['add', '.'], worktreePath);
      await execGitOrThrow(['commit', '--no-edit'], worktreePath);
    } catch (commitError) {
      const errorMsg = getErrorMessage(commitError);
      logger.error('Failed to complete merge commit', { id, error: errorMsg });
      res.status(500).json({
        error: 'Failed to complete merge commit',
        message: errorMsg,
      });
      return;
    }

    // Clear conflict data and update status
    taskService.update(id!, {
      status: 'approved',
      conflict_files: null,
      error: null,
    });
    sseEmitter.emitStatus(id!, 'approved');
    sseEmitter.emitLog(id!, 'info', 'Conflictos resueltos, creando PR...');

    // Push and create PR asynchronously
    const agentService = getAgentService();
    agentService.pushAndCreatePR(id!).catch((error) => {
      const errorMsg = getErrorMessage(error);
      logger.error('Failed to push and create PR after conflict resolution', { id, error: errorMsg });
      taskService.update(id!, {
        status: 'awaiting_review',
        error: `Failed to create PR: ${errorMsg}`,
      });
      sseEmitter.emitStatus(id!, 'awaiting_review');
      sseEmitter.emitError(id!, errorMsg);
    });

    res.json({
      status: 'resolving',
      message: 'Conflictos resueltos. Creando PR...',
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
