import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import type { Task, TaskStatus } from '../services/task.service.js';
import type { Message, LLMProvider, Tool } from '../llm/types.js';
import { createOpenAIProvider } from '../llm/openai.js';
import { ToolExecutor } from './executor.js';
import { AGENT_TOOLS } from './tools.js';
import {
  getSystemPrompt,
  getPlanningPrompt,
  getImplementationPrompt,
  getFeedbackPrompt,
  getBuildFailurePrompt,
  getSummaryPrompt,
  getResumePrompt,
  getEmptyRepoPrompt,
} from './prompts.js';

const logger = createLogger('agent-runner');

/**
 * Maximum number of iterations for the agent loop.
 */
const MAX_ITERATIONS = 50;

/**
 * Maximum consecutive errors before aborting.
 */
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * Maximum number of build retry attempts.
 */
const MAX_BUILD_RETRIES = 3;

/**
 * Options for creating an AgentRunner.
 */
export interface AgentRunnerOptions {
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
  /** Reviewer feedback when resuming (from changes_requested) */
  reviewFeedback?: string;
  /** Whether the repository is empty (no commits) */
  isEmptyRepo?: boolean;
}

/**
 * Result of running the agent.
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
 * Agent runner that executes tasks using an LLM with tool calling.
 */
export class AgentRunner {
  private readonly options: AgentRunnerOptions;
  private readonly llm: LLMProvider;
  private readonly executor: ToolExecutor;
  private readonly tools: Tool[];

  private messages: Message[] = [];
  private feedbackQueue: string[] = [];
  private isRunning: boolean = false;
  private isCancelled: boolean = false;
  private taskCompleted: boolean = false;
  private completionSummary: string = '';

  constructor(options: AgentRunnerOptions) {
    this.options = options;
    this.llm = createOpenAIProvider();
    // Pass taskId to ToolExecutor for process tracking and cleanup
    this.executor = new ToolExecutor(options.workspacePath, options.taskId);
    this.tools = AGENT_TOOLS;

    logger.info('AgentRunner initialized', {
      taskId: options.taskId,
      workspacePath: options.workspacePath,
    });
  }

  /**
   * Runs the agent to completion.
   */
  async run(): Promise<AgentRunResult> {
    if (this.isRunning) {
      return {
        success: false,
        error: 'Agent is already running',
        iterations: 0,
      };
    }

    this.isRunning = true;
    this.isCancelled = false;
    this.taskCompleted = false;

    try {
      // Initialize conversation with system prompt
      this.initializeConversation();

      // Check if this is a resume from changes_requested
      if (this.options.isResume && this.options.reviewFeedback) {
        // Resume mode: skip planning, go directly to addressing feedback
        this.options.onLog('info', 'Resuming to address reviewer feedback');
        this.options.onStatusChange('in_progress');

        // Add the resume prompt with reviewer feedback
        this.addUserMessage(getResumePrompt(this.options.reviewFeedback));
      } else if (this.options.isEmptyRepo) {
        // Empty repository mode: instruct agent to create initial project structure
        this.options.onLog('info', 'Empty repository detected, starting project initialization');
        this.options.onStatusChange('planning');

        // Add the empty repo prompt
        this.addUserMessage(getEmptyRepoPrompt());

        // Transition to in_progress after planning prompt
        this.options.onStatusChange('in_progress');
      } else {
        // Normal mode: Planning phase
        this.options.onStatusChange('planning');
        this.options.onLog('info', 'Starting planning phase');

        this.addUserMessage(getPlanningPrompt());

        // Transition to in_progress after planning prompt
        this.options.onStatusChange('in_progress');
      }

      // Run the main agent loop
      const result = await this.agentLoop();

      // Validate build if we have a build command and completed successfully
      if (result.success && this.options.task.build_command) {
        const buildValidationResult = await this.validateBuildWithRetries(result.iterations);
        if (!buildValidationResult.success) {
          return buildValidationResult;
        }
      }

      // If successful, transition to awaiting_review
      if (result.success) {
        this.options.onStatusChange('awaiting_review');
      }

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Agent run failed', { taskId: this.options.taskId, error: errorMessage });
      this.options.onLog('error', `Agent failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        iterations: 0,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Adds feedback to the agent's queue.
   */
  addFeedback(message: string): void {
    this.feedbackQueue.push(message);
    this.options.onLog('info', `Feedback queued: ${message}`);
  }

  /**
   * Cancels the agent execution.
   */
  cancel(): void {
    this.isCancelled = true;
    this.options.onLog('info', 'Agent cancellation requested');
  }

  /**
   * Returns whether the agent is currently running.
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Initializes the conversation with the system prompt.
   */
  private initializeConversation(): void {
    const systemPrompt = getSystemPrompt(this.options.task, this.options.task.context_files);

    this.messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    this.options.onLog('debug', 'Conversation initialized with system prompt');
  }

  /**
   * Adds a user message to the conversation.
   */
  private addUserMessage(content: string): void {
    this.messages.push({
      role: 'user',
      content,
    });
  }

  /**
   * Main agent loop that processes LLM responses and executes tools.
   */
  private async agentLoop(): Promise<AgentRunResult> {
    let iterations = 0;
    let consecutiveErrors = 0;

    while (iterations < MAX_ITERATIONS && !this.isCancelled && !this.taskCompleted) {
      iterations++;
      this.options.onLog('debug', `Agent iteration ${iterations}/${MAX_ITERATIONS}`);

      // Check for feedback before each iteration
      const feedback = this.checkForFeedback();
      if (feedback) {
        this.addUserMessage(getFeedbackPrompt(feedback));
        this.options.onLog('info', 'Feedback incorporated into conversation');
      }

      try {
        // Get response from LLM
        const response = await this.llm.chat(this.messages, this.tools);

        // Add response to conversation
        this.messages.push(response);

        // Log the response content
        if (response.content) {
          this.options.onLog('info', `Agent: ${response.content.substring(0, 200)}...`);
        }

        // Process tool calls if any
        if (response.tool_calls && response.tool_calls.length > 0) {
          const toolResults = await this.processToolCalls(response.tool_calls);

          // Add tool results to conversation
          for (const result of toolResults) {
            this.messages.push(result);
          }

          // Reset consecutive errors on successful tool execution
          consecutiveErrors = 0;
        } else if (!response.content) {
          // No content and no tool calls - unusual response
          consecutiveErrors++;
          this.options.onLog('warn', 'Empty response from LLM');

          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            return {
              success: false,
              error: 'Too many consecutive empty responses from LLM',
              iterations,
            };
          }

          // Prompt the agent to continue
          this.addUserMessage(getImplementationPrompt());
        } else {
          // Response has content but no tool calls
          // Check if agent is asking questions or needs guidance
          consecutiveErrors = 0;

          // If no tool calls for several iterations, prompt for action
          const recentMessages = this.messages.slice(-3);
          const hasRecentToolCalls = recentMessages.some((m) => m.tool_calls && m.tool_calls.length > 0);

          if (!hasRecentToolCalls && iterations > 3) {
            this.addUserMessage(getSummaryPrompt());
          }
        }
      } catch (error) {
        consecutiveErrors++;
        const errorMessage = getErrorMessage(error);
        this.options.onLog('error', `LLM error: ${errorMessage}`);

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          return {
            success: false,
            error: `Too many consecutive errors: ${errorMessage}`,
            iterations,
          };
        }

        // Wait a bit before retrying
        await this.sleep(1000);
      }
    }

    if (this.isCancelled) {
      return {
        success: false,
        error: 'Agent was cancelled',
        iterations,
      };
    }

    if (!this.taskCompleted && iterations >= MAX_ITERATIONS) {
      return {
        success: false,
        error: `Agent reached maximum iterations (${MAX_ITERATIONS}) without completing`,
        iterations,
      };
    }

    return {
      success: true,
      summary: this.completionSummary,
      iterations,
    };
  }

  /**
   * Processes tool calls from the LLM response.
   */
  private async processToolCalls(
    toolCalls: NonNullable<Message['tool_calls']>
  ): Promise<Message[]> {
    const results: Message[] = [];

    for (const toolCall of toolCalls) {
      const { name, arguments: argsString } = toolCall.function;
      this.options.onLog('info', `Executing tool: ${name}`);

      try {
        // Parse arguments
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(argsString) as Record<string, unknown>;
        } catch {
          results.push({
            role: 'tool',
            content: `Error: Invalid JSON in tool arguments: ${argsString.substring(0, 100)}`,
            tool_call_id: toolCall.id,
          });
          continue;
        }

        // Log detailed info for run_command
        if (name === 'run_command' && args.command) {
          this.options.onLog('info', `Running command: ${args.command}`);
        }

        // Execute the tool
        const result = await this.executor.execute(name, args);

        // Check for task completion
        if (name === 'task_complete' && result.success) {
          this.taskCompleted = true;
          this.completionSummary = args.summary as string;
          this.options.onLog('info', 'Task marked as complete');
        }

        // Create tool result message
        const resultMessage: Message = {
          role: 'tool',
          content: result.success
            ? result.output
            : `Error: ${result.error}\n${result.output}`.trim(),
          tool_call_id: toolCall.id,
        };

        results.push(resultMessage);

        this.options.onLog(
          result.success ? 'debug' : 'warn',
          `Tool ${name} ${result.success ? 'succeeded' : 'failed'}`,
          { output: result.output.substring(0, 100) }
        );
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        this.options.onLog('error', `Tool ${name} threw error: ${errorMessage}`);

        results.push({
          role: 'tool',
          content: `Error executing tool: ${errorMessage}`,
          tool_call_id: toolCall.id,
        });
      }
    }

    return results;
  }

  /**
   * Checks for and retrieves feedback from the queue.
   */
  private checkForFeedback(): string | null {
    if (this.feedbackQueue.length > 0) {
      return this.feedbackQueue.shift() ?? null;
    }
    return null;
  }

  /**
   * Validates the build by running the build command.
   */
  private async validateBuild(): Promise<{ success: boolean; output: string }> {
    const buildCommand = this.options.task.build_command;
    if (!buildCommand) {
      return { success: true, output: '' };
    }

    this.options.onLog('info', `Running build command: ${buildCommand}`);

    const result = await this.executor.execute('run_command', { command: buildCommand });

    return {
      success: result.success,
      output: result.output + (result.error ? `\n${result.error}` : ''),
    };
  }

  /**
   * Validates the build with up to MAX_BUILD_RETRIES attempts.
   * If the build fails, the agent attempts to fix the errors before retrying.
   *
   * @param currentIterations - The current iteration count for tracking
   * @returns AgentRunResult indicating success or failure
   */
  private async validateBuildWithRetries(currentIterations: number): Promise<AgentRunResult> {
    const buildCommand = this.options.task.build_command;
    if (!buildCommand) {
      return { success: true, iterations: currentIterations };
    }

    let lastBuildOutput = '';
    let totalIterations = currentIterations;

    for (let attempt = 1; attempt <= MAX_BUILD_RETRIES; attempt++) {
      this.options.onLog('info', `Build validation attempt ${attempt}/${MAX_BUILD_RETRIES}`);

      const buildResult = await this.validateBuild();

      if (buildResult.success) {
        this.options.onLog('info', `Build succeeded on attempt ${attempt}`);
        return { success: true, iterations: totalIterations };
      }

      lastBuildOutput = buildResult.output;
      this.options.onLog('warn', `Build failed on attempt ${attempt}/${MAX_BUILD_RETRIES}`, {
        output: lastBuildOutput.substring(0, 500),
      });

      // If this is not the last attempt, try to fix the errors
      if (attempt < MAX_BUILD_RETRIES) {
        this.options.onLog('info', `Attempting to fix build errors (retry ${attempt})`);

        const fixResult = await this.fixBuildErrors(lastBuildOutput);
        totalIterations = fixResult.iterations;

        if (!fixResult.success) {
          // Agent loop itself failed, stop retrying
          this.options.onLog('error', 'Agent failed while trying to fix build errors');
          return {
            success: false,
            error: `Agent failed while fixing build errors: ${fixResult.error}`,
            iterations: totalIterations,
          };
        }

        // The fixBuildErrors ran the agent loop, now we continue to next iteration
        // to validate the build again
      }
    }

    // All retries exhausted
    this.options.onLog('error', `Build failed after ${MAX_BUILD_RETRIES} attempts`);
    return {
      success: false,
      error: `Build validation failed after ${MAX_BUILD_RETRIES} retries. Last error:\n${lastBuildOutput}`,
      iterations: totalIterations,
    };
  }

  /**
   * Attempts to fix build errors by having the agent analyze and fix them.
   */
  private async fixBuildErrors(buildOutput: string): Promise<AgentRunResult> {
    const buildCommand = this.options.task.build_command ?? '';
    this.options.onLog('warn', 'Build failed, attempting to fix errors');

    // Reset taskCompleted flag so agent can work again
    this.taskCompleted = false;

    // Add build failure context to conversation
    this.addUserMessage(getBuildFailurePrompt(buildCommand, buildOutput));

    // Run the agent loop again to fix issues
    const result = await this.agentLoop();

    return result;
  }

  /**
   * Utility function to sleep for a given number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates a new AgentRunner instance.
 */
export function createAgentRunner(options: AgentRunnerOptions): AgentRunner {
  return new AgentRunner(options);
}

export default AgentRunner;
