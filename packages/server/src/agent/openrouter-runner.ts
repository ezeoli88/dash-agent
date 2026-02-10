import { randomUUID } from 'crypto';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import type { Message, Tool } from '../llm/types.js';
import { createOpenRouterProvider } from '../llm/openrouter.js';
import type { LLMProvider } from '../llm/types.js';
import { ToolExecutor } from './executor.js';
import { AGENT_TOOLS } from './tools.js';
import { buildCLIPrompt } from './cli-prompts.js';
import { getAICredentials } from '../services/secrets.service.js';
import type { IAgentRunner, OpenRouterRunnerOptions, AgentRunResult } from './types.js';

const logger = createLogger('openrouter-runner');

/**
 * Maximum consecutive errors before aborting.
 */
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * Maximum number of build retry attempts.
 */
const MAX_BUILD_RETRIES = 3;

/**
 * OpenRouter API-based agent runner that implements the IAgentRunner interface.
 * Uses the OpenRouter LLM provider with a tool-calling loop pattern.
 */
export class OpenRouterRunner implements IAgentRunner {
  private readonly options: OpenRouterRunnerOptions;
  private readonly llm: LLMProvider;
  private readonly executor: ToolExecutor;
  private readonly tools: Tool[];

  private messages: Message[] = [];
  private feedbackQueue: string[] = [];
  private isRunning: boolean = false;
  private isCancelled: boolean = false;
  private taskCompleted: boolean = false;
  private completionSummary: string = '';

  constructor(options: OpenRouterRunnerOptions) {
    // Get API key from secrets service
    const credentials = getAICredentials();
    if (!credentials || credentials.provider !== 'openrouter') {
      throw new Error('OpenRouter API key not configured');
    }

    // Use task model, fall back to model from credentials metadata
    const model = options.agentModel || credentials.model;
    if (!model) {
      throw new Error('No model specified for OpenRouter. Please select a model in Settings or in the task.');
    }

    // Update options so logging and status messages show the actual model used
    this.options = { ...options, agentModel: model };

    this.llm = createOpenRouterProvider(credentials.apiKey, model);
    this.executor = new ToolExecutor(options.workspacePath, options.taskId);
    this.tools = AGENT_TOOLS;

    logger.info('OpenRouterRunner initialized', {
      taskId: options.taskId,
      model,
      requestedModel: options.agentModel || '(none - used fallback)',
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
      // Build prompt using CLI prompt builder (reuses the same prompt generation)
      const promptOptions: Parameters<typeof buildCLIPrompt>[1] = {
        agentType: 'openrouter',
      };
      if (this.options.isResume !== undefined) promptOptions.isResume = this.options.isResume;
      if (this.options.reviewFeedback !== undefined) promptOptions.reviewFeedback = this.options.reviewFeedback;
      if (this.options.isEmptyRepo !== undefined) promptOptions.isEmptyRepo = this.options.isEmptyRepo;
      if (this.options.repository) promptOptions.repository = this.options.repository;
      if (this.options.planOnly !== undefined) promptOptions.planOnly = this.options.planOnly;
      if (this.options.approvedPlan !== undefined) promptOptions.approvedPlan = this.options.approvedPlan;

      const prompt = buildCLIPrompt(this.options.task, promptOptions);

      // Initialize conversation with system prompt and task prompt
      this.messages = [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Begin working on the task. Start by exploring the codebase structure.' },
      ];

      this.options.onLog('info', `Starting OpenRouter agent with model: ${this.options.agentModel}`);
      this.options.onStatusChange('planning');

      // Emit initial system chat event
      this.options.onChatEvent?.({
        id: randomUUID(),
        role: 'system',
        content: `OpenRouter agent started with model: ${this.options.agentModel}`,
        timestamp: new Date().toISOString(),
      });

      // Transition to in_progress
      this.options.onStatusChange('in_progress');

      // Run the main agent loop
      const result = await this.agentLoop();

      // Validate build if we have a build command and completed successfully
      if (result.success && this.options.task.build_command) {
        const buildValidationResult = await this.validateBuildWithRetries(result.iterations);
        if (!buildValidationResult.success) {
          return buildValidationResult;
        }
      }

      // If successful and NOT plan-only, transition to awaiting_review
      if (result.success && !this.options.planOnly) {
        this.options.onStatusChange('awaiting_review');
      }

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('OpenRouter agent run failed', { taskId: this.options.taskId, error: errorMessage });
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

    // Emit user chat message
    this.options.onChatEvent?.({
      id: randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });
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
   * Main agent loop that processes LLM responses and executes tools.
   */
  private async agentLoop(): Promise<AgentRunResult> {
    let iterations = 0;
    let consecutiveErrors = 0;

    while (!this.isCancelled && !this.taskCompleted) {
      iterations++;
      this.options.onLog('debug', `Agent iteration ${iterations}`);

      // Check for feedback before each iteration
      const feedback = this.checkForFeedback();
      if (feedback) {
        this.messages.push({ role: 'user', content: `User feedback: ${feedback}` });
        this.options.onLog('info', 'Feedback incorporated into conversation');
      }

      try {
        // Get response from LLM
        const response = await this.llm.chat(this.messages, this.tools);

        // Add response to conversation
        this.messages.push(response);

        // Log and emit assistant text
        if (response.content) {
          this.options.onLog('info', `Agent: ${response.content.substring(0, 200)}...`);
          this.options.onChatEvent?.({
            id: randomUUID(),
            role: 'assistant',
            content: response.content,
            timestamp: new Date().toISOString(),
          });
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
          // No content and no tool calls — unusual response
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
          this.messages.push({
            role: 'user',
            content: 'Continue implementing the task. Use tools to make progress.',
          });
        } else {
          // Response has content but no tool calls
          consecutiveErrors = 0;

          // If no tool calls for several iterations, prompt for action
          const recentMessages = this.messages.slice(-3);
          const hasRecentToolCalls = recentMessages.some((m) => m.tool_calls && m.tool_calls.length > 0);

          if (!hasRecentToolCalls && iterations > 3) {
            this.messages.push({
              role: 'user',
              content: 'If you have completed the task, call the task_complete tool with a summary. Otherwise, continue making progress using tools.',
            });
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

        // Wait before retrying
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

      // Emit tool activity (running)
      this.options.onChatEvent?.({
        id: toolCall.id,
        name,
        summary: '',
        status: 'running',
        timestamp: new Date().toISOString(),
      });

      try {
        // Parse arguments
        let args: Record<string, unknown>;
        try {
          const parsed = JSON.parse(argsString);
          args = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed as Record<string, unknown> : {};
        } catch {
          results.push({
            role: 'tool',
            content: `Error: Invalid JSON in tool arguments: ${argsString.substring(0, 100)}`,
            tool_call_id: toolCall.id,
          });
          // Emit tool error
          this.options.onChatEvent?.({
            id: toolCall.id,
            name,
            summary: 'Invalid JSON arguments',
            status: 'error',
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        // Extract a meaningful summary from tool arguments
        const key = args.path ?? args.command ?? args.pattern ?? args.query;
        const summary = typeof key === 'string' ? key.substring(0, 200) : '';

        // Update tool activity with summary
        this.options.onChatEvent?.({
          id: toolCall.id,
          name,
          summary,
          status: 'running',
          timestamp: new Date().toISOString(),
        });

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

        // Emit tool completed/error
        this.options.onChatEvent?.({
          id: toolCall.id,
          name,
          summary: result.success ? 'done' : (result.error?.substring(0, 200) ?? 'error'),
          status: result.success ? 'completed' : 'error',
          timestamp: new Date().toISOString(),
        });

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

        // Emit tool error
        this.options.onChatEvent?.({
          id: toolCall.id,
          name,
          summary: errorMessage.substring(0, 200),
          status: 'error',
          timestamp: new Date().toISOString(),
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

        // Reset taskCompleted flag so agent can work again
        this.taskCompleted = false;

        // Add build failure context to conversation
        this.messages.push({
          role: 'user',
          content: `The build command \`${buildCommand}\` failed with the following output:\n\n${lastBuildOutput}\n\nPlease fix the errors and try again. Do NOT run the build command yourself.`,
        });

        // Run agent loop again to fix issues
        const fixResult = await this.agentLoop();
        totalIterations = fixResult.iterations;

        if (!fixResult.success) {
          this.options.onLog('error', 'Agent failed while trying to fix build errors');
          return {
            success: false,
            error: `Agent failed while fixing build errors: ${fixResult.error}`,
            iterations: totalIterations,
          };
        }
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
   * Utility function to sleep for a given number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates a new OpenRouterRunner instance.
 */
export function createOpenRouterRunner(options: OpenRouterRunnerOptions): OpenRouterRunner {
  return new OpenRouterRunner(options);
}

export default OpenRouterRunner;
