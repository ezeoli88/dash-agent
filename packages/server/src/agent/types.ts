import type { ChatMessageEvent, ToolActivityEvent } from '@dash-agent/shared';
import type { TaskStatus } from '../services/task.service.js';
import type { Task } from '../services/task.service.js';
import type { Repository } from '../services/repo.service.js';

/**
 * Result of running an agent.
 */
export interface AgentRunResult {
  /** Whether the agent completed successfully */
  success: boolean;
  /** Summary of what was done (if successful) */
  summary?: string;
  /** Error message (if failed) */
  error?: string;
  /** Number of iterations completed */
  iterations: number;
}

/**
 * Common options for all agent runners.
 */
export interface BaseRunnerOptions {
  /** The task ID being executed */
  taskId: string;
  /** Path to the workspace (worktree) for the task */
  workspacePath: string;
  /** The task object with all details */
  task: Task;
  /** Callback for logging agent activity */
  onLog: (level: string, message: string, data?: Record<string, unknown>) => void;
  /** Callback for status changes */
  onStatusChange: (status: TaskStatus) => void;
  /** Whether this is a resume from changes_requested status */
  isResume?: boolean;
  /** Reviewer feedback when resuming */
  reviewFeedback?: string;
  /** Whether the repository is empty */
  isEmptyRepo?: boolean;
  /** Repository context (detected stack, conventions, patterns) */
  repository?: Repository | null;
  /** Callback for structured chat events (messages and tool activity) */
  onChatEvent?: (event: ChatMessageEvent | ToolActivityEvent) => void;
}

/**
 * Additional options for CLI-based agent runners.
 */
export interface CLIRunnerOptions extends BaseRunnerOptions {
  /** The CLI agent type to use */
  agentType: 'claude-code' | 'codex' | 'copilot' | 'gemini';
  /** The model to use (agent-specific) */
  agentModel?: string;
}

/**
 * Options for creating any runner (union type for the factory).
 */
export type RunnerOptions = BaseRunnerOptions & {
  agentType?: 'claude-code' | 'codex' | 'copilot' | 'gemini';
  agentModel?: string;
};

/**
 * Common interface for all agent runners.
 * Both the legacy AgentRunner (LLM API-based) and CLIAgentRunner implement this.
 */
export interface IAgentRunner {
  /** Runs the agent to completion */
  run(): Promise<AgentRunResult>;
  /** Sends feedback to the running agent */
  addFeedback(message: string): void;
  /** Cancels the agent execution */
  cancel(): void;
  /** Returns whether the agent is currently running */
  getIsRunning(): boolean;
}
