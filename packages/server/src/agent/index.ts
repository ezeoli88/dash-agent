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
  type OpenRouterRunnerOptions,
  type RunnerOptions,
} from './types.js';

// CLI Agent Runner
export { CLIAgentRunner, createCLIAgentRunner } from './cli-runner.js';

// CLI Prompts
export { buildCLIPrompt } from './cli-prompts.js';

// OpenRouter Runner (API-based, tool-calling loop)
export { OpenRouterRunner, createOpenRouterRunner } from './openrouter-runner.js';

// --- Factory ---

import { createAgentRunner } from './runner.js';
import { createCLIAgentRunner } from './cli-runner.js';
import { createOpenRouterRunner } from './openrouter-runner.js';
import type { RunnerOptions, IAgentRunner, CLIRunnerOptions, OpenRouterRunnerOptions } from './types.js';

/**
 * Factory function that creates the appropriate agent runner.
 * - 'openrouter' → OpenRouterRunner (API-based, tool-calling loop)
 * - Other agentType → CLIAgentRunner (spawns CLI child process)
 * - No agentType → legacy AgentRunner (API-based, OpenAI)
 */
export function createRunner(options: RunnerOptions): IAgentRunner {
  // OpenRouter uses API-based tool-calling loop (not a CLI)
  if (options.agentType === 'openrouter') {
    const orOptions: OpenRouterRunnerOptions = {
      taskId: options.taskId,
      workspacePath: options.workspacePath,
      task: options.task,
      onLog: options.onLog,
      onStatusChange: options.onStatusChange,
      agentType: 'openrouter',
      agentModel: options.agentModel ?? '',
    };
    if (options.onChatEvent) orOptions.onChatEvent = options.onChatEvent;
    if (options.isResume !== undefined) orOptions.isResume = options.isResume;
    if (options.reviewFeedback !== undefined) orOptions.reviewFeedback = options.reviewFeedback;
    if (options.isEmptyRepo !== undefined) orOptions.isEmptyRepo = options.isEmptyRepo;
    if (options.repository) orOptions.repository = options.repository;
    if (options.planOnly !== undefined) orOptions.planOnly = options.planOnly;
    if (options.approvedPlan !== undefined) orOptions.approvedPlan = options.approvedPlan;
    return createOpenRouterRunner(orOptions);
  }

  if (options.agentType) {
    const cliOptions: CLIRunnerOptions = {
      taskId: options.taskId,
      workspacePath: options.workspacePath,
      task: options.task,
      onLog: options.onLog,
      onStatusChange: options.onStatusChange,
      agentType: options.agentType,
    };
    if (options.onChatEvent) cliOptions.onChatEvent = options.onChatEvent;
    if (options.isResume !== undefined) cliOptions.isResume = options.isResume;
    if (options.reviewFeedback !== undefined) cliOptions.reviewFeedback = options.reviewFeedback;
    if (options.isEmptyRepo !== undefined) cliOptions.isEmptyRepo = options.isEmptyRepo;
    if (options.agentModel !== undefined) cliOptions.agentModel = options.agentModel;
    if (options.repository) cliOptions.repository = options.repository;
    return createCLIAgentRunner(cliOptions);
  }
  // Legacy runner (API-based)
  return createAgentRunner(options);
}
