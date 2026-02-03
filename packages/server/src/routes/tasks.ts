import { Router, Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';
import { taskService, type Task } from '../services/task.service.js';
import { getAgentService } from '../services/agent.service.js';
import { getGitService } from '../services/git.service.js';
import { getSSEEmitter } from '../utils/sse-emitter.js';
import { CreateTaskSchema, UpdateTaskSchema } from '../schemas/task.schema.js';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';

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
 */
router.get('/', (_req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.debug('GET /tasks');
    const tasks = taskService.getAll();
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
// Agent Execution Endpoints
// =============================================================================

/**
 * POST /tasks/:id/execute - Start the agent for a task
 *
 * Accepts tasks with status:
 * - 'backlog': Initial execution
 * - 'failed': Retry after failure
 * - 'changes_requested': Resume to address reviewer feedback
 */
router.post('/:id/execute', requireTaskId, loadTask, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { task } = req as RequestWithTask;
    const { id } = req.params;
    logger.info('POST /tasks/:id/execute', { id, status: task.status });

    // Check if task can be executed
    const validStatuses = ['backlog', 'failed', 'changes_requested'];
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
      logger.error('Agent execution failed', {
        taskId: id,
        error: getErrorMessage(error),
      });
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
    const { id } = req.params;
    logger.info('POST /tasks/:id/cancel', { id });

    const agentService = getAgentService();

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

    // Validate task status
    if (task.status !== 'awaiting_review') {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot approve task with status: ${task.status}. Expected: awaiting_review`,
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
 * - Validates the task is in 'pr_created' status
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

    // Validate task status
    if (task.status !== 'pr_created') {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot request changes for task with status: ${task.status}. Expected: pr_created`,
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

    // Validate task status
    if (task.status !== 'pr_created') {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot mark PR as merged for task with status: ${task.status}. Expected: pr_created`,
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

    // Validate task status
    if (!['pr_created', 'changes_requested'].includes(task.status)) {
      res.status(400).json({
        error: 'Invalid task status',
        message: `Cannot mark PR as closed for task with status: ${task.status}. Expected: pr_created or changes_requested`,
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
    } else if (task.status === 'awaiting_review') {
      const reviewEvent = `event: awaiting_review\ndata: ${JSON.stringify({
        message: 'Agent completed. Review changes before creating PR.',
      })}\n\n`;
      res.write(reviewEvent);
      // Don't close - user may want to monitor while reviewing
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

export default router;
