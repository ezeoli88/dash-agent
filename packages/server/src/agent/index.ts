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

// Agent runner
export {
  AgentRunner,
  createAgentRunner,
  type AgentRunnerOptions,
  type AgentRunResult,
} from './runner.js';
