/**
 * Agent module exports.
 * Provides the AI agent components for autonomous task execution.
 */

// Tool definitions
export { AGENT_TOOLS, getToolByName, getToolNames } from './tools.js';

// Command whitelist
export {
  COMMAND_WHITELIST,
  BLOCKED_COMMANDS,
  isCommandAllowed,
  getAllowedCommands,
  getAllowedSubcommands,
  type CommandValidationResult,
} from './whitelist.js';

// Tool executor
export { ToolExecutor, type ToolResult } from './executor.js';

// Prompts
export {
  getSystemPrompt,
  getPlanningPrompt,
  getImplementationPrompt,
  getFeedbackPrompt,
  getBuildFailurePrompt,
  getSummaryPrompt,
} from './prompts.js';

// Agent runner (legacy, API-based)
export {
  AgentRunner,
  createAgentRunner,
  type AgentRunnerOptions,
  type AgentRunResult,
} from './runner.js';

// Types (common interface)
export {
  type IAgentRunner,
  type AgentRunResult as AgentRunResultType,
  type BaseRunnerOptions,
  type CLIRunnerOptions,
  type RunnerOptions,
} from './types.js';

// CLI Agent Runner
export { CLIAgentRunner, createCLIAgentRunner } from './cli-runner.js';

// CLI Prompts
export { buildCLIPrompt } from './cli-prompts.js';

// --- Factory ---

import { createAgentRunner } from './runner.js';
import { createCLIAgentRunner } from './cli-runner.js';
import type { RunnerOptions, IAgentRunner, CLIRunnerOptions } from './types.js';

/**
 * Factory function that creates the appropriate agent runner.
 * If agentType is specified, creates a CLIAgentRunner.
 * Otherwise, creates the legacy AgentRunner.
 */
export function createRunner(options: RunnerOptions): IAgentRunner {
  if (options.agentType) {
    const cliOptions: CLIRunnerOptions = {
      taskId: options.taskId,
      workspacePath: options.workspacePath,
      task: options.task,
      onLog: options.onLog,
      onStatusChange: options.onStatusChange,
      agentType: options.agentType,
    };
    if (options.isResume !== undefined) cliOptions.isResume = options.isResume;
    if (options.reviewFeedback !== undefined) cliOptions.reviewFeedback = options.reviewFeedback;
    if (options.isEmptyRepo !== undefined) cliOptions.isEmptyRepo = options.isEmptyRepo;
    if (options.agentModel !== undefined) cliOptions.agentModel = options.agentModel;
    return createCLIAgentRunner(cliOptions);
  }
  // Legacy runner (API-based)
  return createAgentRunner(options);
}
