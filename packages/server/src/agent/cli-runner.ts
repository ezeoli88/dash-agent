import type { ChildProcess } from 'child_process';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { spawnTracked, killChildProcessTree } from '../utils/process-killer.js';
import { buildCLIPrompt } from './cli-prompts.js';
import type { IAgentRunner, CLIRunnerOptions, AgentRunResult } from './types.js';

const logger = createLogger('cli-runner');

/**
 * Describes the command and arguments to spawn for a given CLI agent.
 */
interface CLICommand {
  command: string;
  args: string[];
}

/**
 * Builds the spawn command for a specific CLI agent type.
 */
function buildCLICommand(agentType: string, prompt: string, model?: string): CLICommand {
  switch (agentType) {
    case 'claude-code':
      return {
        command: 'claude',
        args: [
          '-p',
          prompt,
          '--output-format',
          'stream-json',
          '--verbose',
          '--allowedTools',
          'Read,Edit,Bash,Write',
          ...(model ? ['--model', model] : []),
        ],
      };

    case 'codex':
      return {
        command: 'codex',
        args: [
          'exec',
          prompt,
          '--json',
          '--full-auto',
          ...(model ? ['-m', model] : []),
        ],
      };

    case 'copilot':
      return {
        command: 'copilot',
        args: ['-p', prompt, '--allow-all-tools'],
      };

    case 'gemini':
      return {
        command: 'gemini',
        args: [
          '--non-interactive',
          prompt,
          '--output-format',
          'ndjson',
          '--yolo',
          ...(model ? ['--model', model] : []),
        ],
      };

    default:
      throw new Error(`Unsupported agent type: ${agentType}`);
  }
}

/**
 * Attempts to parse a line of JSON output, returning null if parsing fails.
 */
function tryParseJSON(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * CLI-based agent runner that implements the IAgentRunner interface
 * by executing coding CLIs (Claude Code, Codex, Copilot, Gemini) as child processes.
 */
export class CLIAgentRunner implements IAgentRunner {
  private process: ChildProcess | null = null;
  private isRunning: boolean = false;
  private isCancelled: boolean = false;
  private readonly options: CLIRunnerOptions;
  private output: string = '';
  private feedbackQueue: string[] = [];

  constructor(options: CLIRunnerOptions) {
    this.options = options;

    logger.info('CLIAgentRunner initialized', {
      taskId: options.taskId,
      agentType: options.agentType,
      workspacePath: options.workspacePath,
    });
  }

  /**
   * Runs the CLI agent to completion.
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
    this.output = '';

    try {
      // Build the prompt using the CLI prompt builder
      const promptOptions: Parameters<typeof buildCLIPrompt>[1] = {};
      if (this.options.isResume !== undefined) promptOptions.isResume = this.options.isResume;
      if (this.options.reviewFeedback !== undefined) promptOptions.reviewFeedback = this.options.reviewFeedback;
      if (this.options.isEmptyRepo !== undefined) promptOptions.isEmptyRepo = this.options.isEmptyRepo;
      const prompt = buildCLIPrompt(this.options.task, promptOptions);

      // Build the CLI command
      const cliCommand = buildCLICommand(
        this.options.agentType,
        prompt,
        this.options.agentModel
      );

      this.options.onLog('info', `Starting CLI agent: ${this.options.agentType}`, {
        command: cliCommand.command,
      });

      // Begin in planning status
      this.options.onStatusChange('planning');

      // Spawn the child process
      const result = await this.spawnAndMonitor(cliCommand);

      // If successful, transition to awaiting_review
      if (result.success) {
        this.options.onStatusChange('awaiting_review');
      }

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('CLI agent run failed', {
        taskId: this.options.taskId,
        error: errorMessage,
      });
      this.options.onLog('error', `CLI agent failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        iterations: 1,
      };
    } finally {
      this.isRunning = false;
      this.process = null;
    }
  }

  /**
   * Sends feedback to the running CLI process via stdin.
   * If the process is not running or stdin is not writable, queues the feedback.
   */
  addFeedback(message: string): void {
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(message + '\n');
      this.options.onLog('info', `Feedback sent to CLI: ${message}`);
    } else {
      this.feedbackQueue.push(message);
      this.options.onLog('info', `Feedback queued: ${message}`);
    }
  }

  /**
   * Cancels the CLI agent execution by killing the child process tree.
   */
  cancel(): void {
    this.isCancelled = true;

    if (this.process) {
      killChildProcessTree(this.process);
      this.options.onLog('info', 'CLI process cancelled');
    }
  }

  /**
   * Returns whether the CLI agent is currently running.
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Spawns the CLI process and monitors its output until completion.
   */
  private spawnAndMonitor(cliCommand: CLICommand): Promise<AgentRunResult> {
    return new Promise<AgentRunResult>((resolve) => {
      const proc = spawnTracked(
        cliCommand.command,
        cliCommand.args,
        {
          cwd: this.options.workspacePath,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          shell: false,
        },
        this.options.taskId
      );

      this.process = proc;
      let hasTransitionedToInProgress = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';

      // Handle stdout — parse output line by line
      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        this.output += chunk;
        stdoutBuffer += chunk;

        // Transition to in_progress on first output
        if (!hasTransitionedToInProgress) {
          hasTransitionedToInProgress = true;
          this.options.onStatusChange('in_progress');
        }

        // Process complete lines
        const lines = stdoutBuffer.split('\n');
        // Keep the last incomplete line in the buffer
        stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          this.parseOutputLine(trimmed);
        }

        // Flush any queued feedback now that process is running
        this.flushFeedbackQueue();
      });

      // Handle stderr — log as warnings
      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderrBuffer += chunk;

        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            this.options.onLog('warn', `CLI stderr: ${trimmed}`);
          }
        }
      });

      // Handle process exit
      proc.on('close', (code: number | null) => {
        // Process any remaining buffered data
        if (stdoutBuffer.trim()) {
          this.parseOutputLine(stdoutBuffer.trim());
        }
        if (stderrBuffer.trim()) {
          this.options.onLog('warn', `CLI stderr: ${stderrBuffer.trim()}`);
        }

        const exitCode = code ?? 1;

        if (this.isCancelled) {
          this.options.onLog('info', 'CLI process exited after cancellation');
          resolve({
            success: false,
            error: 'Agent was cancelled',
            iterations: 1,
          });
          return;
        }

        if (exitCode === 0) {
          this.options.onLog('info', 'CLI process completed successfully');
          resolve({
            success: true,
            summary: this.extractSummary(),
            iterations: 1,
          });
        } else {
          const errorMsg = `CLI process exited with code ${exitCode}`;
          this.options.onLog('error', errorMsg);
          resolve({
            success: false,
            error: errorMsg,
            iterations: 1,
          });
        }
      });

      // Handle spawn errors
      proc.on('error', (error: Error) => {
        const errorMessage = getErrorMessage(error);
        logger.error('CLI process spawn error', {
          taskId: this.options.taskId,
          error: errorMessage,
        });
        this.options.onLog('error', `CLI spawn error: ${errorMessage}`);

        resolve({
          success: false,
          error: `Failed to start CLI agent: ${errorMessage}`,
          iterations: 0,
        });
      });
    });
  }

  /**
   * Parses a single line of output from the CLI process.
   * Handles JSON-structured output from supported CLIs and falls back to raw logging.
   */
  private parseOutputLine(line: string): void {
    switch (this.options.agentType) {
      case 'claude-code':
        this.parseClaudeCodeOutput(line);
        break;
      case 'codex':
        this.parseCodexOutput(line);
        break;
      case 'copilot':
      case 'gemini':
        this.parseGenericOutput(line);
        break;
      default:
        this.options.onLog('info', `CLI: ${line}`);
    }
  }

  /**
   * Parses Claude Code stream-json output.
   * Looks for objects with a `type` field to identify message types.
   */
  private parseClaudeCodeOutput(line: string): void {
    const parsed = tryParseJSON(line);

    if (!parsed) {
      // Not JSON — log as raw output
      this.options.onLog('info', `CLI: ${line}`);
      return;
    }

    const type = parsed.type as string | undefined;

    switch (type) {
      case 'assistant': {
        // Agent text response
        const content = parsed.content as string | undefined;
        if (content) {
          this.options.onLog('info', `Agent: ${content.substring(0, 500)}`);
        }
        break;
      }
      case 'tool_use': {
        // Tool invocation
        const toolName = parsed.name as string | undefined;
        this.options.onLog('info', `Tool: ${toolName ?? 'unknown'}`);
        break;
      }
      case 'tool_result': {
        // Tool result
        const output = parsed.output as string | undefined;
        if (output) {
          this.options.onLog('debug', `Tool result: ${output.substring(0, 200)}`);
        }
        break;
      }
      case 'result': {
        // Final result
        const result = parsed.result as string | undefined;
        if (result) {
          this.options.onLog('info', `Result: ${result.substring(0, 500)}`);
        }
        break;
      }
      case 'error': {
        const errorMsg = parsed.error as string | undefined;
        this.options.onLog('error', `CLI error: ${errorMsg ?? 'unknown error'}`);
        break;
      }
      default:
        // Other message types — log at debug level
        this.options.onLog('debug', `CLI event (${type ?? 'unknown'}): ${line.substring(0, 200)}`);
    }
  }

  /**
   * Parses Codex JSONL output.
   */
  private parseCodexOutput(line: string): void {
    const parsed = tryParseJSON(line);

    if (!parsed) {
      this.options.onLog('info', `CLI: ${line}`);
      return;
    }

    const type = parsed.type as string | undefined;
    const message = (parsed.message ?? parsed.content ?? parsed.text) as string | undefined;

    if (message) {
      this.options.onLog('info', `Agent: ${message.substring(0, 500)}`);
    } else if (type) {
      this.options.onLog('debug', `CLI event (${type}): ${line.substring(0, 200)}`);
    }
  }

  /**
   * Parses generic text output (Copilot, Gemini, or any unsupported format).
   */
  private parseGenericOutput(line: string): void {
    // Try JSON first in case the CLI outputs structured data
    const parsed = tryParseJSON(line);

    if (parsed) {
      const message = (parsed.message ?? parsed.content ?? parsed.text) as string | undefined;
      if (message) {
        this.options.onLog('info', `Agent: ${message.substring(0, 500)}`);
        return;
      }
    }

    // Fall back to raw text logging
    this.options.onLog('info', `CLI: ${line}`);
  }

  /**
   * Flushes queued feedback messages to the running process stdin.
   */
  private flushFeedbackQueue(): void {
    if (!this.process?.stdin?.writable || this.feedbackQueue.length === 0) {
      return;
    }

    while (this.feedbackQueue.length > 0) {
      const msg = this.feedbackQueue.shift();
      if (msg) {
        this.process.stdin.write(msg + '\n');
        this.options.onLog('info', `Queued feedback sent to CLI: ${msg}`);
      }
    }
  }

  /**
   * Extracts a summary from the accumulated output.
   * Attempts to find a structured result; falls back to the last meaningful lines.
   */
  private extractSummary(): string {
    // For Claude Code, try to find the result message in JSON output
    if (this.options.agentType === 'claude-code') {
      const lines = this.output.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const rawLine = lines[i];
        if (!rawLine) continue;
        const parsed = tryParseJSON(rawLine.trim());
        if (parsed?.type === 'result' && parsed.result) {
          return String(parsed.result).substring(0, 1000);
        }
      }
    }

    // Fall back to the last non-empty lines of output
    const lines = this.output.split('\n').filter((l) => l.trim().length > 0);
    const lastLines = lines.slice(-5).join('\n');
    return lastLines.substring(0, 1000) || 'CLI agent completed';
  }
}

/**
 * Creates a new CLIAgentRunner instance.
 */
export function createCLIAgentRunner(options: CLIRunnerOptions): CLIAgentRunner {
  return new CLIAgentRunner(options);
}
