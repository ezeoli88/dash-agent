import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { taskService, type Task } from './task.service.js';
import { getAgentService } from './agent.service.js';
import { getSSEEmitter } from '../utils/sse-emitter.js';

const logger = createLogger('dev-agent-service');

/**
 * Input for executing a spec.
 */
interface ExecuteSpecInput {
  task_id: string;
}

/**
 * Output from executing a spec.
 */
interface ExecuteSpecOutput {
  branch_name: string;
  pr_url: string | null;
  pr_number: number | null;
  files_changed: string[];
  status: 'coding' | 'review' | 'failed';
}

/**
 * AI Provider configuration from request headers.
 */
interface AIProviderConfig {
  provider: 'claude' | 'openai' | 'openrouter';
  apiKey: string;
  model?: string; // Required for OpenRouter
}

/**
 * Starts the Dev Agent to execute a spec.
 *
 * This function:
 * 1. Validates the task status is 'approved'
 * 2. Updates status to 'coding'
 * 3. Delegates to the existing AgentService which handles:
 *    - Setting up worktrees
 *    - Running the agent
 *    - Creating commits
 *    - Creating PRs (via approveAndCreatePR)
 *
 * @param input - The input for spec execution
 * @param aiConfig - AI provider configuration (used for future enhancements)
 * @returns Promise resolving when the agent is started (not when it completes)
 */
export async function executeSpec(
  input: ExecuteSpecInput,
  _aiConfig?: AIProviderConfig
): Promise<{ status: 'started'; message: string }> {
  const { task_id } = input;

  logger.info('Dev Agent: Starting spec execution', { task_id });

  // Get the task
  const task = taskService.getById(task_id);
  if (!task) {
    throw new Error(`Task not found: ${task_id}`);
  }

  // Validate task status
  if (task.status !== 'approved') {
    throw new Error(`Cannot execute spec for task with status: ${task.status}. Expected: approved`);
  }

  // Validate task has a spec
  if (!task.final_spec && !task.description) {
    throw new Error('Task has no spec to execute');
  }

  // Generate branch name
  const branchName = generateBranchName(task);

  // Update task with branch name and set status to coding
  taskService.update(task_id, {
    branch_name: branchName,
    status: 'coding',
  });

  // Emit SSE status update
  const sseEmitter = getSSEEmitter();
  sseEmitter.emitStatus(task_id, 'coding');
  sseEmitter.emitLog(task_id, 'info', `Dev Agent: Starting work on branch ${branchName}...`);

  // Start the agent asynchronously
  // The existing AgentService handles the actual work
  const agentService = getAgentService();

  // Update task status back to 'approved' briefly so startAgent validates properly
  // Note: This is a workaround because startAgent expects specific statuses
  taskService.update(task_id, { status: 'planning' });

  // Start agent execution (non-blocking)
  agentService.startAgent(task_id, false).catch((error) => {
    const errorMsg = getErrorMessage(error);
    logger.error('Dev Agent: Execution failed', { task_id, error: errorMsg });

    taskService.update(task_id, {
      status: 'failed',
      error: errorMsg,
    });
    sseEmitter.emitStatus(task_id, 'failed');
    sseEmitter.emitError(task_id, `Dev Agent error: ${errorMsg}`);
  });

  logger.info('Dev Agent: Started successfully', { task_id, branch_name: branchName });

  return {
    status: 'started',
    message: 'Dev Agent started working on the spec',
  };
}

/**
 * Generates a branch name for the task.
 */
function generateBranchName(task: Task): string {
  // Extract task ID suffix (last 8 chars)
  const idSuffix = task.id.slice(-8);

  // Create a slug from the title
  const titleSlug = slugify(task.title || 'task', 30);

  return `feature/${titleSlug}-${idSuffix}`;
}

/**
 * Converts a string to a URL-safe slug.
 */
function slugify(text: string, maxLength: number = 50): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with dashes
    .replace(/^-+|-+$/g, '')      // Remove leading/trailing dashes
    .slice(0, maxLength)          // Limit length
    .replace(/-+$/, '');          // Remove trailing dashes after slice
}

/**
 * Cancels a running Dev Agent execution.
 */
export function cancelExecution(taskId: string): void {
  logger.info('Dev Agent: Cancelling execution', { taskId });

  const agentService = getAgentService();

  if (agentService.isAgentRunning(taskId)) {
    agentService.cancelAgent(taskId);
  }

  taskService.update(taskId, {
    status: 'failed',
    error: 'Execution cancelled by user',
  });

  const sseEmitter = getSSEEmitter();
  sseEmitter.emitStatus(taskId, 'failed');
  sseEmitter.emitError(taskId, 'Execution cancelled by user');
}

/**
 * Gets the status of a Dev Agent execution.
 */
export function getExecutionStatus(taskId: string): {
  isRunning: boolean;
  status: string;
  timeoutInfo: { timeoutAt: Date; startedAt: Date } | null;
} {
  const agentService = getAgentService();
  const task = taskService.getById(taskId);

  return {
    isRunning: agentService.isAgentRunning(taskId),
    status: task?.status ?? 'unknown',
    timeoutInfo: agentService.getTimeoutInfo(taskId),
  };
}

export default {
  executeSpec,
  cancelExecution,
  getExecutionStatus,
};
