import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { taskService, type Task, type TaskStatus } from './task.service.js';
import { getGitService } from './git.service.js';
import { getGitHubClient } from '../github/client.js';
import { AgentRunner, createAgentRunner, type AgentRunResult } from '../agent/runner.js';
import { getSSEEmitter } from '../utils/sse-emitter.js';
import { killProcessesForTask } from '../utils/process-killer.js';
import { getPRCommentsService } from './pr-comments.service.js';

const logger = createLogger('agent-service');

/** Default timeout duration in milliseconds (10 minutes) */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** Warning threshold before timeout (5 minutes before) */
const WARNING_THRESHOLD_MS = 5 * 60 * 1000;

/** Extension duration in milliseconds (5 minutes) */
const EXTENSION_DURATION_MS = 5 * 60 * 1000;

/**
 * Represents an active agent execution.
 */
interface ActiveAgent {
  /** The task ID being executed */
  taskId: string;
  /** The agent runner instance */
  runner: AgentRunner;
  /** Promise that resolves when the agent completes */
  promise: Promise<AgentRunResult>;
  /** Timestamp when the agent started */
  startedAt: Date;
  /** Timeout timer handle */
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  /** Warning timer handle */
  warningTimer: ReturnType<typeof setTimeout> | null;
  /** When the agent will timeout */
  timeoutAt: Date;
  /** Whether warning has been sent */
  warningSent: boolean;
}

/**
 * Agent log entry for storing execution logs.
 */
export interface AgentLogEntry {
  timestamp: string;
  level: string;
  message: string;
  data: Record<string, unknown> | undefined;
}

/** Maximum number of log entries per task to prevent memory leaks */
const MAX_LOGS_PER_TASK = 1000;

/**
 * Service for managing agent execution.
 * Handles starting, stopping, and monitoring agent runners.
 */
export class AgentService {
  /** Map of active agents by task ID */
  private activeAgents: Map<string, ActiveAgent> = new Map();

  /** Map of agent logs by task ID */
  private agentLogs: Map<string, AgentLogEntry[]> = new Map();

  /** Git service for worktree management */
  private gitService = getGitService();

  /** SSE emitter for real-time events */
  private sseEmitter = getSSEEmitter();

  /**
   * Starts an agent for a task.
   *
   * @param taskId - The task ID to start the agent for
   * @param isResume - Whether this is a resume from changes_requested status
   * @throws Error if the task doesn't exist or agent is already running
   */
  async startAgent(taskId: string, isResume: boolean = false): Promise<void> {
    logger.info('Starting agent for task', { taskId, isResume });

    // Check if agent is already running
    if (this.activeAgents.has(taskId)) {
      throw new Error(`Agent is already running for task ${taskId}`);
    }

    // Get the task
    const task = taskService.getById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Validate task status
    // Note: 'planning' is now accepted because the route updates status to 'planning'
    // BEFORE calling startAgent() to ensure the frontend can connect to SSE immediately
    const validStatuses = isResume ? ['changes_requested', 'planning'] : ['backlog', 'failed', 'planning'];
    if (!validStatuses.includes(task.status)) {
      throw new Error(`Cannot start agent for task with status: ${task.status}. Expected: ${validStatuses.join(' or ')}`);
    }

    // Initialize logs for this task (preserve existing logs if resuming)
    if (!isResume || !this.agentLogs.has(taskId)) {
      this.agentLogs.set(taskId, []);
    }

    try {
      // Use setupWorktree which reuses existing worktrees (important for retry)
      // This ensures that retry operations don't lose the agent's previous work
      this.log(taskId, 'info', 'Setting up worktree for task');
      const worktreeResult = await this.gitService.setupWorktree(
        taskId,
        task.repo_url,
        task.target_branch
      );

      const workspacePath = worktreeResult.worktreePath;

      if (worktreeResult.reused) {
        this.log(taskId, 'info', `Reusing existing worktree at: ${workspacePath}`);
        if (isResume) {
          this.log(taskId, 'info', 'Resuming work on existing changes');
        } else {
          this.log(taskId, 'info', 'Retrying with existing worktree (preserving previous work)');
        }
      } else {
        this.log(taskId, 'info', `New worktree created at: ${workspacePath}`);
      }

      // Get any pending review feedback for resume
      const reviewFeedback = isResume ? this.getPendingReviewFeedback(taskId) : null;

      // Build runner options
      const runnerOptions: Parameters<typeof createAgentRunner>[0] = {
        taskId,
        workspacePath,
        task,
        onLog: (level, message, data) => this.log(taskId, level, message, data),
        onStatusChange: (status) => this.handleStatusChange(taskId, status),
        isResume,
      };

      // Only add reviewFeedback if it has a value
      if (reviewFeedback) {
        runnerOptions.reviewFeedback = reviewFeedback;
      }

      // Create the agent runner with resume context if applicable
      const runner = createAgentRunner(runnerOptions);

      // Calculate timeout
      const now = new Date();
      const timeoutAt = new Date(now.getTime() + DEFAULT_TIMEOUT_MS);

      // Start the agent asynchronously
      const promise = this.runAgent(taskId, runner, task, isResume);

      // Create active agent entry
      const activeAgent: ActiveAgent = {
        taskId,
        runner,
        promise,
        startedAt: now,
        timeoutTimer: null,
        warningTimer: null,
        timeoutAt,
        warningSent: false,
      };

      // Set up timeout timers
      this.setupTimeoutTimers(activeAgent);

      // Store the active agent
      this.activeAgents.set(taskId, activeAgent);

      // NOTE: Initial status update to 'planning' is done in the route BEFORE calling startAgent()
      // This ensures the frontend receives the status change in the HTTP response
      // and can connect to SSE immediately. Further status changes (in_progress, etc.)
      // are handled via onStatusChange callback in runAgent()

      logger.info('Agent started successfully', {
        taskId,
        timeoutAt: timeoutAt.toISOString(),
        isResume,
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to start agent', { taskId, error: errorMessage });

      // Emit error event
      this.sseEmitter.emitError(taskId, `Failed to start agent: ${errorMessage}`);

      // Update task with error
      taskService.update(taskId, {
        status: 'failed',
        error: `Failed to start agent: ${errorMessage}`,
      });

      throw error;
    }
  }

  /**
   * Sets up timeout and warning timers for an agent.
   */
  private setupTimeoutTimers(agent: ActiveAgent): void {
    const now = Date.now();
    const timeoutIn = agent.timeoutAt.getTime() - now;
    const warningIn = timeoutIn - WARNING_THRESHOLD_MS;

    // Set warning timer (fires 5 minutes before timeout)
    if (warningIn > 0 && !agent.warningSent) {
      agent.warningTimer = setTimeout(() => {
        this.handleTimeoutWarning(agent.taskId);
      }, warningIn);
    }

    // Set timeout timer
    if (timeoutIn > 0) {
      agent.timeoutTimer = setTimeout(() => {
        this.handleTimeout(agent.taskId);
      }, timeoutIn);
    }
  }

  /**
   * Clears timeout timers for an agent.
   */
  private clearTimeoutTimers(agent: ActiveAgent): void {
    if (agent.warningTimer) {
      clearTimeout(agent.warningTimer);
      agent.warningTimer = null;
    }
    if (agent.timeoutTimer) {
      clearTimeout(agent.timeoutTimer);
      agent.timeoutTimer = null;
    }
  }

  /**
   * Handles timeout warning event.
   */
  private handleTimeoutWarning(taskId: string): void {
    const agent = this.activeAgents.get(taskId);
    if (!agent || agent.warningSent) return;

    agent.warningSent = true;

    const message = `Agent has been running for ${Math.round(
      (Date.now() - agent.startedAt.getTime()) / 60000
    )} minutes`;

    this.log(taskId, 'warn', message);
    this.sseEmitter.emitTimeoutWarning(taskId, message, agent.timeoutAt);
  }

  /**
   * Handles timeout event - cancels the agent.
   */
  private handleTimeout(taskId: string): void {
    const agent = this.activeAgents.get(taskId);
    if (!agent) return;

    this.log(taskId, 'error', 'Agent timed out');
    this.sseEmitter.emitError(taskId, 'Agent execution timed out', 'TIMEOUT');

    // IMPORTANT: Kill all spawned processes for this task
    // This prevents zombie processes on Windows that keep files locked
    this.log(taskId, 'info', 'Killing all spawned processes due to timeout');
    killProcessesForTask(taskId);

    // Cancel the agent
    agent.runner.cancel();

    taskService.update(taskId, {
      status: 'failed',
      error: 'Agent execution timed out',
    });
  }

  /**
   * Extends the timeout for a running agent.
   *
   * @param taskId - The task ID
   * @returns The new timeout timestamp
   */
  extendTimeout(taskId: string): Date {
    const agent = this.activeAgents.get(taskId);
    if (!agent) {
      throw new Error(`No active agent for task ${taskId}`);
    }

    // Clear existing timers
    this.clearTimeoutTimers(agent);

    // Extend timeout by 5 minutes from now
    const now = new Date();
    agent.timeoutAt = new Date(now.getTime() + EXTENSION_DURATION_MS);
    agent.warningSent = false;

    // Set up new timers
    this.setupTimeoutTimers(agent);

    this.log(taskId, 'info', `Timeout extended to ${agent.timeoutAt.toISOString()}`);
    this.sseEmitter.emitLog(taskId, 'info', 'Timeout extended by 5 minutes');

    return agent.timeoutAt;
  }

  /**
   * Gets the timeout information for a running agent.
   *
   * @param taskId - The task ID
   * @returns Timeout information or null if no active agent
   */
  getTimeoutInfo(taskId: string): { timeoutAt: Date; startedAt: Date } | null {
    const agent = this.activeAgents.get(taskId);
    if (!agent) return null;

    return {
      timeoutAt: agent.timeoutAt,
      startedAt: agent.startedAt,
    };
  }

  /**
   * Runs the agent and handles completion.
   *
   * @param taskId - The task ID
   * @param runner - The agent runner
   * @param task - The task object
   * @param isResume - Whether this is a resume from changes_requested
   */
  private async runAgent(
    taskId: string,
    runner: AgentRunner,
    task: Task,
    isResume: boolean = false
  ): Promise<AgentRunResult> {
    try {
      const result = await runner.run();

      if (result.success) {
        this.log(taskId, 'info', `Agent completed successfully: ${result.summary}`);

        // Commit changes
        const workspacePath = this.gitService.getWorktreePath(taskId);
        if (workspacePath) {
          const hasChanges = await this.gitService.hasChanges(workspacePath);
          if (hasChanges) {
            // Use different commit message for resume
            const commitMessage = isResume
              ? `fix: ${task.title} (address review feedback)\n\n${result.summary ?? 'Address reviewer feedback'}`
              : `feat: ${task.title}\n\n${result.summary ?? 'Automated changes by agent'}`;

            await this.gitService.commitChanges(workspacePath, commitMessage);
            this.log(taskId, 'info', 'Changes committed');

            // If this is a resume, push the changes immediately to update the PR
            if (isResume && task.pr_url) {
              try {
                const branchName = await this.gitService.getCurrentBranch(workspacePath);
                this.log(taskId, 'info', `Pushing changes to update PR: ${branchName}`);
                await this.gitService.pushBranch(workspacePath, branchName);
                this.log(taskId, 'info', 'Changes pushed, PR updated automatically');
              } catch (pushError) {
                const pushErrorMessage = getErrorMessage(pushError);
                this.log(taskId, 'warn', `Failed to push changes: ${pushErrorMessage}`);
                // Don't fail the task, just warn - user can push manually
              }
            }
          }
        }

        // Emit awaiting review event
        const reviewMessage = isResume
          ? 'Agent completed addressing review feedback. Review changes and approve or request more changes.'
          : 'Agent completed. Review changes before creating PR.';
        this.sseEmitter.emitAwaitingReview(taskId, reviewMessage);
      } else {
        this.log(taskId, 'error', `Agent failed: ${result.error}`);
        this.sseEmitter.emitError(taskId, result.error ?? 'Unknown error');

        taskService.update(taskId, {
          status: 'failed',
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.log(taskId, 'error', `Agent error: ${errorMessage}`);
      this.sseEmitter.emitError(taskId, errorMessage);

      taskService.update(taskId, {
        status: 'failed',
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        iterations: 0,
      };
    } finally {
      // Clear timers and clean up active agent
      const agent = this.activeAgents.get(taskId);
      if (agent) {
        this.clearTimeoutTimers(agent);
      }
      this.activeAgents.delete(taskId);
      logger.info('Agent execution finished', { taskId, isResume });
    }
  }

  /**
   * Sends feedback to a running agent.
   *
   * @param taskId - The task ID
   * @param message - The feedback message
   */
  sendFeedback(taskId: string, message: string): void {
    const agent = this.activeAgents.get(taskId);
    if (!agent) {
      throw new Error(`No active agent for task ${taskId}`);
    }

    this.log(taskId, 'info', `User feedback: ${message}`);
    agent.runner.addFeedback(message);
  }

  /**
   * Cancels a running agent.
   *
   * @param taskId - The task ID
   */
  cancelAgent(taskId: string): void {
    const agent = this.activeAgents.get(taskId);
    if (!agent) {
      throw new Error(`No active agent for task ${taskId}`);
    }

    this.log(taskId, 'info', 'Agent cancellation requested');

    // Clear timers
    this.clearTimeoutTimers(agent);

    // IMPORTANT: Kill all spawned processes for this task
    // This prevents zombie processes on Windows that keep files locked
    this.log(taskId, 'info', 'Killing all spawned processes for task');
    killProcessesForTask(taskId);

    // Cancel the runner
    agent.runner.cancel();

    // Remove from active agents
    this.activeAgents.delete(taskId);

    taskService.update(taskId, {
      status: 'failed',
      error: 'Agent was cancelled by user',
    });

    // Emit error and close SSE connections (terminal event)
    this.sseEmitter.emitError(taskId, 'Agent cancelled by user', 'CANCELLED');
  }

  /**
   * Approves changes and creates a PR on GitHub.
   *
   * @param taskId - The task ID
   * @returns The created PR URL
   */
  async approveAndCreatePR(taskId: string): Promise<string> {
    // Get the task
    const task = taskService.getById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Validate task status
    if (task.status !== 'awaiting_review') {
      throw new Error(`Cannot approve task with status: ${task.status}. Expected: awaiting_review`);
    }

    // Check if PR already exists (from previous approval before request-changes)
    const prAlreadyExists = task.pr_url !== null;

    // Update status to approved
    taskService.update(taskId, { status: 'approved' });
    this.sseEmitter.emitStatus(taskId, 'approved');

    try {
      // Get worktree info
      const workspacePath = this.gitService.getWorktreePath(taskId);

      // If PR already exists and worktree is gone (e.g., server restarted),
      // just update status and return the existing PR URL
      if (prAlreadyExists && !workspacePath) {
        this.log(taskId, 'info', 'PR already exists, updating status');
        taskService.update(taskId, { status: 'pr_created', error: null });
        this.sseEmitter.emitComplete(taskId, task.pr_url!, 'PR already exists');
        this.sseEmitter.emitStatus(taskId, 'pr_created');
        return task.pr_url!;
      }

      if (!workspacePath) {
        throw new Error('Worktree not found for task');
      }

      if (prAlreadyExists) {
        this.log(taskId, 'info', 'Approval received, pushing changes to existing PR');
      } else {
        this.log(taskId, 'info', 'Approval received, creating PR');
      }

      // Get branch name
      const branchName = await this.gitService.getCurrentBranch(workspacePath);
      this.log(taskId, 'info', `Pushing branch: ${branchName}`);

      // Push the branch
      await this.gitService.pushBranch(workspacePath, branchName);
      this.log(taskId, 'info', 'Branch pushed successfully');

      // If PR already exists, just update status and return
      if (prAlreadyExists) {
        taskService.update(taskId, { status: 'pr_created', error: null });
        this.log(taskId, 'info', `Changes pushed to existing PR: ${task.pr_url}`);
        this.sseEmitter.emitComplete(taskId, task.pr_url!, 'Changes pushed to existing PR');
        this.sseEmitter.emitStatus(taskId, 'pr_created');
        return task.pr_url!;
      }

      // Create PR using GitHub client
      const githubClient = getGitHubClient();

      // Get changed files for PR description
      const changedFiles = await this.gitService.getChangedFiles(workspacePath);
      const filesDescription = changedFiles
        .map((f) => `- ${f.path} (${f.status}: +${f.additions}/-${f.deletions})`)
        .join('\n');

      const prBody = `## Summary

This PR was automatically generated by Agent Board.

**Task:** ${task.title}

**Description:** ${task.description}

## Changes

${filesDescription || 'No file changes detected.'}

---
*Generated by Agent Board*
`;

      const prResult = await githubClient.createPullRequest({
        repoUrl: task.repo_url,
        head: branchName,
        base: task.target_branch,
        title: task.title,
        body: prBody,
      });

      // Update task with PR URL - use pr_created instead of done
      // The worktree is kept alive for potential changes requested
      const updatedTask = taskService.update(taskId, {
        status: 'pr_created',
        pr_url: prResult.url,
      });

      // Start tracking PR for comments
      if (updatedTask) {
        try {
          const prCommentsService = getPRCommentsService();
          prCommentsService.onTaskStatusChange(updatedTask, 'pr_created');
        } catch (error) {
          logger.warn('Failed to start PR comment tracking', { taskId, error: getErrorMessage(error) });
        }
      }

      this.log(taskId, 'info', `PR created: ${prResult.url}`);
      this.log(taskId, 'info', 'Worktree preserved for potential change requests');
      this.sseEmitter.emitComplete(taskId, prResult.url, `PR #${prResult.number} created. Worktree preserved.`);
      this.sseEmitter.emitStatus(taskId, 'pr_created');

      return prResult.url;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.log(taskId, 'error', `Failed to create PR: ${errorMessage}`);
      this.sseEmitter.emitError(taskId, `Failed to create PR: ${errorMessage}`);

      // Revert status to awaiting_review so user can retry
      taskService.update(taskId, {
        status: 'awaiting_review',
        error: `Failed to create PR: ${errorMessage}`,
      });

      throw new Error(`Failed to create PR: ${errorMessage}`);
    }
  }

  /**
   * Checks if an agent is running for a task.
   *
   * @param taskId - The task ID
   * @returns True if an agent is running
   */
  isAgentRunning(taskId: string): boolean {
    return this.activeAgents.has(taskId);
  }

  /**
   * Gets the logs for a task's agent execution.
   *
   * @param taskId - The task ID
   * @returns Array of log entries
   */
  getAgentLogs(taskId: string): AgentLogEntry[] {
    return this.agentLogs.get(taskId) ?? [];
  }

  /**
   * Gets information about active agents.
   */
  getActiveAgents(): Array<{ taskId: string; startedAt: Date; timeoutAt: Date }> {
    return Array.from(this.activeAgents.values()).map((a) => ({
      taskId: a.taskId,
      startedAt: a.startedAt,
      timeoutAt: a.timeoutAt,
    }));
  }

  /**
   * Handles status changes from the agent runner.
   * Automatically cleans up logs when task reaches a terminal state.
   */
  private handleStatusChange(taskId: string, status: TaskStatus): void {
    this.log(taskId, 'info', `Status changed to: ${status}`);

    // Update the task status in the database
    const updatedTask = taskService.update(taskId, { status });

    // Verify the update was successful
    if (updatedTask) {
      if (updatedTask.status !== status) {
        logger.error('Status mismatch after update', {
          taskId,
          expectedStatus: status,
          actualStatus: updatedTask.status,
        });
      }

      // Notify PR comments service about status change
      try {
        const prCommentsService = getPRCommentsService();
        prCommentsService.onTaskStatusChange(updatedTask, status);
      } catch (error) {
        // Don't fail the status change if PR comments service fails
        logger.warn('Failed to notify PR comments service', {
          taskId,
          status,
          error: getErrorMessage(error),
        });
      }
    } else {
      logger.error('Failed to update task status - task not found', {
        taskId,
        status,
      });
    }

    // Emit SSE event regardless of DB result (for real-time updates)
    this.sseEmitter.emitStatus(taskId, status);

    // Clean up logs when task reaches terminal state
    if (status === 'done' || status === 'failed') {
      this.scheduleLogCleanup(taskId);
    }
  }

  /**
   * Schedules cleanup of agent logs after a delay.
   * This gives clients time to fetch final logs before they're removed.
   *
   * @param taskId - The task ID to clean up logs for
   */
  private scheduleLogCleanup(taskId: string): void {
    // Delay cleanup by 5 minutes to allow clients to retrieve logs
    const CLEANUP_DELAY_MS = 5 * 60 * 1000;

    setTimeout(() => {
      if (this.agentLogs.has(taskId)) {
        this.agentLogs.delete(taskId);
        logger.debug('Agent logs cleaned up for completed task', { taskId });
      }
    }, CLEANUP_DELAY_MS);
  }

  /**
   * Logs a message for a task.
   */
  private log(
    taskId: string,
    level: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    const entry: AgentLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };

    // Add to task logs with limit to prevent memory leaks
    const logs = this.agentLogs.get(taskId) ?? [];
    if (logs.length >= MAX_LOGS_PER_TASK) {
      logs.shift();
    }
    logs.push(entry);
    this.agentLogs.set(taskId, logs);

    // Also emit via SSE
    this.sseEmitter.emitLog(taskId, level, message, data);

    // Also log to main logger
    const logFn = level === 'error' ? logger.error : level === 'warn' ? logger.warn : logger.info;
    logFn.call(logger, `[Task ${taskId}] ${message}`, data);
  }

  /**
   * Cleans up resources for a task (worktree, logs).
   *
   * @param taskId - The task ID
   * @param removeWorktree - Whether to remove the worktree
   */
  async cleanup(taskId: string, removeWorktree: boolean = false): Promise<void> {
    // Close SSE connections
    this.sseEmitter.closeTask(taskId);

    // Remove logs
    this.agentLogs.delete(taskId);

    // Optionally remove worktree
    if (removeWorktree) {
      try {
        await this.gitService.cleanupWorktree(taskId);
        logger.info('Worktree cleaned up', { taskId });
      } catch (error) {
        logger.warn('Failed to cleanup worktree', {
          taskId,
          error: getErrorMessage(error),
        });
      }
    }
  }

  /**
   * Marks the PR as merged and cleans up resources.
   * This should be called when the PR is merged on GitHub.
   *
   * @param taskId - The task ID
   */
  async markPRMerged(taskId: string): Promise<void> {
    const task = taskService.getById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Validate task status
    if (task.status !== 'pr_created') {
      throw new Error(`Cannot mark PR as merged for task with status: ${task.status}. Expected: pr_created`);
    }

    this.log(taskId, 'info', 'PR merged, cleaning up worktree');

    // Stop tracking PR for comments
    try {
      const prCommentsService = getPRCommentsService();
      prCommentsService.untrackPR(taskId);
    } catch (error) {
      logger.warn('Failed to stop PR comment tracking', { taskId, error: getErrorMessage(error) });
    }

    // Update status to done
    taskService.update(taskId, { status: 'done' });
    this.sseEmitter.emitStatus(taskId, 'done');

    // Clean up worktree now that PR is merged
    await this.cleanup(taskId, true);

    this.log(taskId, 'info', 'Task completed, resources cleaned up');
  }

  /**
   * Marks the PR as closed (not merged) and cleans up resources.
   * This should be called when the PR is closed without merging.
   *
   * @param taskId - The task ID
   */
  async markPRClosed(taskId: string): Promise<void> {
    const task = taskService.getById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Validate task status - allow pr_created or changes_requested
    if (!['pr_created', 'changes_requested'].includes(task.status)) {
      throw new Error(`Cannot mark PR as closed for task with status: ${task.status}. Expected: pr_created or changes_requested`);
    }

    this.log(taskId, 'info', 'PR closed, cleaning up worktree');

    // Stop tracking PR for comments
    try {
      const prCommentsService = getPRCommentsService();
      prCommentsService.untrackPR(taskId);
    } catch (error) {
      logger.warn('Failed to stop PR comment tracking', { taskId, error: getErrorMessage(error) });
    }

    // Update status to failed (PR was closed without merging)
    taskService.update(taskId, {
      status: 'failed',
      error: 'PR was closed without merging',
    });
    this.sseEmitter.emitStatus(taskId, 'failed');
    this.sseEmitter.emitError(taskId, 'PR was closed without merging');

    // Clean up worktree
    await this.cleanup(taskId, true);

    this.log(taskId, 'info', 'Task failed (PR closed), resources cleaned up');
  }

  /**
   * Requests changes on a PR and prepares the task for the agent to work again.
   *
   * @param taskId - The task ID
   * @param feedback - The reviewer feedback describing what changes are needed
   */
  async requestChanges(taskId: string, feedback: string): Promise<void> {
    const task = taskService.getById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Validate task status
    if (task.status !== 'pr_created') {
      throw new Error(`Cannot request changes for task with status: ${task.status}. Expected: pr_created`);
    }

    this.log(taskId, 'info', `Changes requested: ${feedback}`);

    // Update status to changes_requested
    const updatedTask = taskService.update(taskId, {
      status: 'changes_requested',
      error: null, // Clear any previous errors
    });
    this.sseEmitter.emitStatus(taskId, 'changes_requested');

    // Continue tracking PR for comments (status still allows tracking)
    if (updatedTask) {
      try {
        const prCommentsService = getPRCommentsService();
        prCommentsService.onTaskStatusChange(updatedTask, 'changes_requested');
      } catch (error) {
        logger.warn('Failed to update PR comment tracking', { taskId, error: getErrorMessage(error) });
      }
    }

    // Store the feedback for when the agent resumes
    // We'll use the feedback queue mechanism
    this.storeFeedbackForResume(taskId, feedback);

    this.log(taskId, 'info', 'Task marked for changes. Call /execute to resume the agent.');
  }

  /**
   * Stores feedback for a task that will be picked up when the agent resumes.
   *
   * @param taskId - The task ID
   * @param feedback - The feedback message
   */
  private storeFeedbackForResume(taskId: string, feedback: string): void {
    // Initialize logs for this task if not present
    if (!this.agentLogs.has(taskId)) {
      this.agentLogs.set(taskId, []);
    }

    // Store the feedback as a special log entry that will be picked up
    this.log(taskId, 'info', `Reviewer feedback stored: ${feedback}`);

    // We'll also store the raw feedback in memory for the agent to pick up
    // This is stored separately from the feedback queue used during active execution
    this.pendingReviewFeedback.set(taskId, feedback);
  }

  /**
   * Gets and clears any pending review feedback for a task.
   *
   * @param taskId - The task ID
   * @returns The pending feedback or null
   */
  getPendingReviewFeedback(taskId: string): string | null {
    const feedback = this.pendingReviewFeedback.get(taskId);
    if (feedback) {
      this.pendingReviewFeedback.delete(taskId);
      return feedback;
    }
    return null;
  }

  /** Map of pending review feedback by task ID */
  private pendingReviewFeedback: Map<string, string> = new Map();

  /**
   * Cleans up a task's worktree explicitly.
   * This should be called when:
   * - PR is merged (status: done)
   * - PR is closed without merging
   * - Task is cancelled by user
   * - Task is deleted
   * - User requests "Start Fresh" to discard previous work
   *
   * This method does NOT clean up on retry/execute - worktrees are preserved
   * to allow the agent to continue from where it left off.
   *
   * @param taskId - The task ID
   * @param reason - The reason for cleanup (for logging)
   * @throws Error if cleanup fails (caller should handle this for user feedback)
   */
  async cleanupTaskWorktree(taskId: string, reason: string = 'explicit cleanup'): Promise<void> {
    logger.info('Cleaning up task worktree', { taskId, reason });

    // Check if there's a worktree to clean up
    const worktreeExists = await this.gitService.worktreeExists(taskId);
    if (!worktreeExists) {
      logger.debug('No worktree to clean up', { taskId });
      return;
    }

    // Perform cleanup - let errors propagate for caller to handle
    await this.gitService.cleanupWorktree(taskId);
    logger.info('Task worktree cleaned up successfully', { taskId, reason });
  }
}

/** Singleton instance */
let agentServiceInstance: AgentService | null = null;

/**
 * Gets the agent service instance.
 */
export function getAgentService(): AgentService {
  if (agentServiceInstance === null) {
    agentServiceInstance = new AgentService();
  }
  return agentServiceInstance;
}

export default getAgentService;
