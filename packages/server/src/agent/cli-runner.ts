import type { ChildProcess } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { spawnTracked, killChildProcessTree } from '../utils/process-killer.js';
import { buildCLIPrompt } from './cli-prompts.js';
import { getAICredentials } from '../services/secrets.service.js';
import type { IAgentRunner, CLIRunnerOptions, AgentRunResult } from './types.js';

const logger = createLogger('cli-runner');

/**
 * Describes the command and arguments to spawn for a given CLI agent.
 */
interface CLICommand {
  command: string;
  args: string[];
  /** When true, the prompt is sent via stdin instead of as a CLI argument */
  useStdin?: boolean;
}

/**
 * Builds the spawn command for a specific CLI agent type.
 */
function buildCLICommand(agentType: string, prompt: string, model?: string): CLICommand {
  switch (agentType) {
    case 'claude-code':
      // Prompt is sent via stdin to avoid Windows command-line argument issues:
      // - cmd.exe interprets special chars (^, &, |, <, >, !) in .cmd wrappers
      // - CreateProcessW has a 32,767 char limit for the entire command line
      // - Multi-line prompts with specs can contain any character
      return {
        command: 'claude',
        args: [
          '-p',
          '--output-format',
          'stream-json',
          '--verbose',
          '--allowedTools',
          'Read,Edit,Bash,Write',
          ...(model ? ['--model', model] : []),
        ],
        useStdin: true,
      };

    case 'codex':
      // NOTE: --full-auto is a shortcut for --sandbox workspace-write, which conflicts
      // with --sandbox danger-full-access. The exec subcommand only accepts
      // --json, --sandbox, and the prompt. Use danger-full-access for full write access.
      return {
        command: 'codex',
        args: [
          'exec',
          '--json',
          '--sandbox', 'danger-full-access',
          ...(model ? ['-m', model] : []),
          prompt,
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
  private promptFilePath: string | null = null;

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
      if (this.options.repository) promptOptions.repository = this.options.repository;
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
      const result = await this.spawnAndMonitor(cliCommand, prompt);

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
      this.cleanupPromptFile();
    }
  }

  /**
   * Sends feedback to the running CLI process via stdin.
   * If the process is not running or stdin is not writable, queues the feedback.
   */
  addFeedback(message: string): void {
    // Emit user chat message
    this.options.onChatEvent?.({
      id: randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

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
    this.cleanupPromptFile();
  }

  /**
   * Returns whether the CLI agent is currently running.
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Cleans up any temporary prompt file created for the Windows shell workaround.
   */
  private cleanupPromptFile(): void {
    if (this.promptFilePath) {
      try { unlinkSync(this.promptFilePath); } catch { /* ignore */ }
      this.promptFilePath = null;
    }
  }

  /**
   * Spawns the CLI process and monitors its output until completion.
   */
  private spawnAndMonitor(cliCommand: CLICommand, prompt: string): Promise<AgentRunResult> {
    return new Promise<AgentRunResult>((resolve) => {
      // On Windows, npm-installed CLIs (codex, copilot) are .cmd wrappers that need
      // shell execution via cmd.exe. But cmd.exe cannot handle multi-line prompts
      // as command-line arguments (newlines break the command).
      // Workaround: write prompt to a temp file and use PowerShell to read it,
      // which handles multi-line strings natively.
      const needsWindowsShellWorkaround =
        process.platform === 'win32' &&
        (cliCommand.command === 'codex' || cliCommand.command === 'copilot');

      let spawnCommand: string;
      let spawnArgs: string[];
      let useShell: boolean = false;

      if (needsWindowsShellWorkaround) {
        this.promptFilePath = join(tmpdir(), `agent-prompt-${randomUUID()}.txt`);
        writeFileSync(this.promptFilePath, prompt, 'utf8');
        const escapedPath = this.promptFilePath.replace(/'/g, "''");

        let innerCmd: string;
        switch (cliCommand.command) {
          case 'codex': {
            // Pipe prompt via stdin instead of passing as argument to avoid
            // PowerShell splitting special characters (curly braces, backticks, etc.)
            const modelArg = this.options.agentModel ? `-m '${this.options.agentModel}' ` : '';
            innerCmd = `$p | & codex exec --json --sandbox danger-full-access ${modelArg}-`;
            break;
          }
          case 'copilot':
            innerCmd = `& copilot -p $p --allow-all-tools`;
            break;
          default:
            innerCmd = `& ${cliCommand.command} $p`;
        }

        const psCommand = `$p = [IO.File]::ReadAllText('${escapedPath}'); ${innerCmd}; exit $LASTEXITCODE`;
        spawnCommand = 'powershell.exe';
        spawnArgs = ['-NoProfile', '-NonInteractive', '-Command', psCommand];
        this.options.onLog('info', 'Using PowerShell workaround for Windows .cmd wrapper');
      } else {
        spawnCommand = cliCommand.command;
        spawnArgs = cliCommand.args;
        // Native binaries (claude, gemini) don't need shell on any platform.
      }

      // Build environment with API keys from secrets service
      // The child process inherits process.env by default, but the API key
      // may only be stored in the encrypted DB (configured via Settings UI)
      const env: Record<string, string | undefined> = { ...process.env };
      try {
        const creds = getAICredentials();
        if (creds) {
          if (creds.provider === 'claude' && !env['ANTHROPIC_API_KEY']) {
            env['ANTHROPIC_API_KEY'] = creds.apiKey;
          } else if (creds.provider === 'openai' && !env['OPENAI_API_KEY']) {
            env['OPENAI_API_KEY'] = creds.apiKey;
          } else if (creds.provider === 'openrouter' && !env['OPENROUTER_API_KEY']) {
            env['OPENROUTER_API_KEY'] = creds.apiKey;
          }
        }
      } catch {
        // Secrets service may not be initialized yet - continue without injecting
      }

      // Diagnostic logging
      logger.info('Spawning CLI process', {
        taskId: this.options.taskId,
        command: spawnCommand,
        argsCount: spawnArgs.length,
        promptLength: prompt.length,
        useStdin: !!cliCommand.useStdin,
        hasAnthropicKey: !!env['ANTHROPIC_API_KEY'],
        hasOpenAIKey: !!env['OPENAI_API_KEY'],
      });

      const proc = spawnTracked(
        spawnCommand,
        spawnArgs,
        {
          cwd: this.options.workspacePath,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          shell: useShell,
          env,
        },
        this.options.taskId
      );

      this.process = proc;

      // For agents that use stdin for prompt delivery (claude-code),
      // write the prompt to stdin and close it. This avoids all Windows
      // command-line argument issues (special chars, length limits).
      if (cliCommand.useStdin) {
        if (proc.stdin) {
          proc.stdin.write(prompt);
          proc.stdin.end();
          this.options.onLog('info', 'Prompt delivered via stdin', { promptLength: prompt.length });
        } else {
          this.options.onLog('error', 'Process stdin not available for prompt delivery');
        }
      }

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

      // Silence detector — warn if no stdout output after 30 seconds
      const silenceTimer = setTimeout(() => {
        if (!hasTransitionedToInProgress) {
          this.options.onLog('warn', 'No output from CLI agent after 30s — agent may be stuck, authenticating, or waiting for input');
          logger.warn('CLI agent silence detected', {
            taskId: this.options.taskId,
            command: spawnCommand,
            promptLength: prompt.length,
          });
        }
      }, 30_000);

      // Handle process exit
      proc.on('close', (code: number | null) => {
        clearTimeout(silenceTimer);
        this.cleanupPromptFile();
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
        this.cleanupPromptFile();
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
   *
   * Claude Code emits JSON lines with a `type` field. Message types wrap
   * an API-style `message` object with `role` and `content` array:
   *   { type: "assistant", message: { role: "assistant", content: [{type: "text", text: "..."}, {type: "tool_use", name: "Read", input: {...}}] } }
   *   { type: "user", message: { role: "user", content: [{type: "tool_result", tool_use_id: "...", content: "...", is_error: false}] } }
   */
  private parseClaudeCodeOutput(line: string): void {
    const parsed = tryParseJSON(line);

    if (!parsed) {
      // Not JSON — log as raw output
      this.options.onLog('info', `CLI: ${line}`);
      return;
    }

    const type = parsed.type as string | undefined;
    // Content blocks live inside message.content (stream-json format)
    const message = parsed.message as Record<string, unknown> | undefined;
    const contentBlocks = (message?.content ?? parsed.content) as unknown;

    switch (type) {
      case 'assistant': {
        // Assistant turn — extract text and tool_use from content blocks
        if (Array.isArray(contentBlocks)) {
          for (const block of contentBlocks) {
            const b = block as Record<string, unknown>;
            if (b.type === 'text' && typeof b.text === 'string') {
              this.options.onLog('info', `Agent: ${b.text.substring(0, 1000)}`);
              // Emit chat message
              this.options.onChatEvent?.({
                id: randomUUID(),
                role: 'assistant',
                content: b.text,
                timestamp: new Date().toISOString(),
              });
            } else if (b.type === 'tool_use') {
              this.logToolUse(b);
              // Emit tool activity
              const toolName = (b.name as string) ?? 'unknown';
              const input = b.input as Record<string, unknown> | undefined;
              const key = input?.file_path ?? input?.command ?? input?.pattern ?? input?.query ?? input?.path;
              this.options.onChatEvent?.({
                id: (b.id as string) ?? randomUUID(),
                name: toolName,
                summary: typeof key === 'string' ? key.substring(0, 200) : '',
                status: 'running',
                timestamp: new Date().toISOString(),
              });
            }
          }
        } else if (typeof contentBlocks === 'string') {
          // Fallback for plain string content
          this.options.onLog('info', `Agent: ${contentBlocks.substring(0, 1000)}`);
          this.options.onChatEvent?.({
            id: randomUUID(),
            role: 'assistant',
            content: contentBlocks,
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      case 'user': {
        // User turn — tool_result blocks. Only log errors to reduce noise.
        if (Array.isArray(contentBlocks)) {
          for (const block of contentBlocks) {
            const b = block as Record<string, unknown>;
            if (b.type === 'tool_result') {
              const toolUseId = (b.tool_use_id as string) ?? '';
              const isError = (b.is_error as boolean) ?? false;
              // Emit tool completed/error
              this.options.onChatEvent?.({
                id: toolUseId,
                name: '',
                summary: isError ? (typeof b.content === 'string' ? b.content.substring(0, 200) : 'error') : 'done',
                status: isError ? 'error' : 'completed',
                timestamp: new Date().toISOString(),
              });
              if (isError) {
                const errorContent = typeof b.content === 'string'
                  ? b.content.substring(0, 500)
                  : 'tool execution failed';
                this.options.onLog('warn', `Tool error: ${errorContent}`);
              }
            }
          }
        }
        break;
      }

      case 'system': {
        // System init — extract useful metadata
        const model = parsed.model as string | undefined;
        const sessionId = parsed.session_id as string | undefined;
        const tools = parsed.tools as unknown[] | undefined;
        const parts: string[] = [];
        if (model) parts.push(`model=${model}`);
        if (sessionId) parts.push(`session=${sessionId.substring(0, 8)}`);
        if (tools?.length) parts.push(`tools=${tools.length}`);
        if (parts.length > 0) {
          this.options.onLog('info', `System: ${parts.join(', ')}`);
          // Emit system chat message
          this.options.onChatEvent?.({
            id: randomUUID(),
            role: 'system',
            content: `System initialized with ${parts.join(', ')}`,
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      case 'tool_use': {
        // Standalone tool_use event (alternative format)
        this.logToolUse(parsed);
        break;
      }

      case 'tool_result': {
        // Standalone tool_result event
        const output = parsed.output as string | undefined;
        if (output) {
          this.options.onLog('debug', `Tool result: ${output.substring(0, 500)}`);
        }
        break;
      }

      case 'result': {
        // Final result with optional cost/duration info
        const result = parsed.result as string | undefined;
        const costUsd = parsed.cost_usd as number | undefined;
        const durationMs = parsed.duration_ms as number | undefined;
        let msg = result ? `Result: ${result.substring(0, 1000)}` : 'Result: completed';
        const resultMeta: string[] = [];
        if (costUsd !== undefined) resultMeta.push(`$${costUsd.toFixed(4)}`);
        if (durationMs !== undefined) resultMeta.push(`${(durationMs / 1000).toFixed(1)}s`);
        if (resultMeta.length > 0) msg += ` (${resultMeta.join(', ')})`;
        this.options.onLog('info', msg);
        // Emit completion message
        this.options.onChatEvent?.({
          id: randomUUID(),
          role: 'system',
          content: `Completed${resultMeta.length > 0 ? ` (${resultMeta.join(', ')})` : ''}`,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'error': {
        const errorMsg = (parsed.error ?? parsed.message) as string | undefined;
        this.options.onLog('error', `CLI error: ${errorMsg ?? 'unknown error'}`);
        break;
      }

      default:
        // Unknown event types — debug level to reduce noise
        this.options.onLog('debug', `CLI event (${type ?? 'unknown'}): ${line.substring(0, 200)}`);
    }
  }

  /**
   * Logs a tool_use block (from assistant content blocks or standalone events).
   */
  private logToolUse(block: Record<string, unknown>): void {
    const toolName = block.name as string | undefined;
    const input = block.input as Record<string, unknown> | undefined;
    let detail = '';
    if (input) {
      const key = input.file_path ?? input.command ?? input.pattern ?? input.query ?? input.path;
      if (typeof key === 'string') {
        detail = `: ${key.substring(0, 200)}`;
      }
    }
    this.options.onLog('info', `Tool: ${toolName ?? 'unknown'}${detail}`);
  }

  /**
   * Parses Codex JSONL output.
   *
   * Codex `exec --json` emits NDJSON events with a `type` field:
   *   - item.started / item.completed: wraps an `item` with type, name, text, content, arguments, output
   *   - turn.completed: milestone indicating a full turn is done
   *   - Top-level message/content/text fields (legacy/simple format)
   */
  private parseCodexOutput(line: string): void {
    const parsed = tryParseJSON(line);

    if (!parsed) {
      this.options.onLog('info', `CLI: ${line}`);
      return;
    }

    const type = parsed.type as string | undefined;

    // Handle item.started / item.completed events (actual Codex --json format)
    if ((type === 'item.completed' || type === 'item.started') && parsed.item) {
      const item = parsed.item as {
        type?: string;
        name?: string;
        role?: string;
        text?: string;
        output?: string;
        content?: Array<{ type?: string; text?: string }>;
        arguments?: string;
      };
      const itemType = item.type;

      // Agent messages — show text content
      if (itemType === 'agent_message' || itemType === 'message') {
        const text = item.text
          ?? item.content?.filter(c => c.text).map(c => c.text).join('');
        if (text) {
          this.options.onLog('info', `Agent: ${text.substring(0, 1000)}`);
          // Emit chat message
          this.options.onChatEvent?.({
            id: randomUUID(),
            role: 'assistant',
            content: text,
            timestamp: new Date().toISOString(),
          });
        } else if (type === 'item.started') {
          this.options.onLog('info', 'Agent is thinking...');
        }
        return;
      }

      // Reasoning — show internal chain-of-thought
      if (itemType === 'reasoning') {
        if (item.text) {
          this.options.onLog('info', `reasoning: ${item.text.substring(0, 1000)}`);
          this.options.onChatEvent?.({
            id: randomUUID(),
            role: 'system',
            content: item.text,
            timestamp: new Date().toISOString(),
          });
        }
        return;
      }

      // Command execution — shell commands run by Codex
      if (itemType === 'command_execution') {
        const command = (item as Record<string, unknown>).command as string ?? 'unknown command';
        const summary = command.length > 100 ? command.substring(0, 100) + '...' : command;

        if (type === 'item.started') {
          this.options.onLog('info', `Tool: ${command.substring(0, 200)}`);
          this.options.onChatEvent?.({
            id: (item as Record<string, unknown>).id as string ?? randomUUID(),
            name: 'Bash',
            summary: summary,
            status: 'running',
            timestamp: new Date().toISOString(),
          });
        } else {
          // item.completed
          const exitCode = (item as Record<string, unknown>).exit_code as number | undefined;
          const itemStatus = (item as Record<string, unknown>).status as string | undefined;
          const status = (itemStatus === 'completed' && exitCode === 0) ? 'completed' : 'error';
          this.options.onLog('info', `Tool: ${command.substring(0, 200)} (exit ${exitCode ?? '?'})`);
          this.options.onChatEvent?.({
            id: (item as Record<string, unknown>).id as string ?? randomUUID(),
            name: 'Bash',
            summary: summary,
            status: status,
            timestamp: new Date().toISOString(),
          });
        }
        return;
      }

      // Function/tool calls — show tool name and key argument
      if (itemType === 'function_call' || itemType === 'tool_use') {
        const toolName = item.name ?? 'unknown';
        let detail = '';
        if (item.arguments) {
          try {
            const args = JSON.parse(item.arguments) as Record<string, unknown>;
            const key = args.file_path ?? args.command ?? args.path
              ?? args.pattern ?? args.query ?? args.file;
            if (typeof key === 'string') {
              detail = `: ${key.substring(0, 200)}`;
            }
          } catch { /* not JSON args */ }
        }
        this.options.onLog('info', `Tool: ${toolName}${detail}`);
        // Emit tool activity on item.started
        if (type === 'item.started') {
          this.options.onChatEvent?.({
            id: randomUUID(),
            name: toolName,
            summary: detail.replace(/^:\s*/, ''),
            status: 'running',
            timestamp: new Date().toISOString(),
          });
        }
        return;
      }

      // Function/tool outputs
      if (itemType === 'function_call_output') {
        const output = item.output ?? item.text;
        if (output) {
          this.options.onLog('debug', `Tool result (${output.length} chars)`);
        }
        // Emit tool completed
        this.options.onChatEvent?.({
          id: randomUUID(),
          name: '',
          summary: output ? `${output.length} chars` : 'done',
          status: 'completed',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Other item types with text
      if (item.text) {
        this.options.onLog('info', `${itemType ?? 'Output'}: ${item.text.substring(0, 500)}`);
        return;
      }

      // Skip noisy events without useful content
      return;
    }

    // turn.completed — useful milestone
    if (type === 'turn.completed') {
      this.options.onLog('info', 'Turn completed');
      return;
    }

    // Top-level message/content/text (legacy/simple format)
    const message = (parsed.message ?? parsed.content ?? parsed.text) as string | undefined;
    if (message) {
      this.options.onLog('info', `Agent: ${message.substring(0, 1000)}`);
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
        this.options.onLog('info', `Agent: ${message.substring(0, 1000)}`);
        return;
      }
      // JSON without recognized message fields — log type if available
      const type = parsed.type as string | undefined;
      if (type) {
        this.options.onLog('info', `CLI event (${type}): ${line.substring(0, 200)}`);
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
          return String(parsed.result).substring(0, 2000);
        }
      }
    }

    // Fall back to the last non-empty lines of output
    const lines = this.output.split('\n').filter((l) => l.trim().length > 0);
    const lastLines = lines.slice(-5).join('\n');
    return lastLines.substring(0, 2000) || 'CLI agent completed';
  }
}

/**
 * Creates a new CLIAgentRunner instance.
 */
export function createCLIAgentRunner(options: CLIRunnerOptions): CLIAgentRunner {
  return new CLIAgentRunner(options);
}
