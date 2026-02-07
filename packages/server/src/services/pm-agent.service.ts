import { spawn, type ChildProcess } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { getRepoService, type Repository } from './repo.service.js';
import { taskService, type Task } from './task.service.js';
import { getSSEEmitter } from '../utils/sse-emitter.js';
import { callOpenRouter } from './ai-provider.service.js';
import { settingsService } from './settings.service.js';
import { detectAgent } from './agent-detection.service.js';
import type { GenerateSpecResponse, AgentType } from '@dash-agent/shared';

const logger = createLogger('pm-agent-service');

/** Tracks running CLI processes for spec generation, keyed by task ID */
const activeSpecProcesses = new Map<string, ChildProcess>();

/**
 * System prompt for the PM Agent.
 * This defines how the PM Agent should analyze user requests and generate specs.
 */
const PM_AGENT_SYSTEM_PROMPT = `Eres un Product Manager tecnico experto. Tu trabajo es tomar ideas vagas
de usuarios y convertirlas en especificaciones detalladas para un agente de desarrollo de IA.

IMPORTANTE: Genera la especificacion en espanol, a menos que el usuario escriba en ingles.

Siempre generas specs en este formato:

## Historia de Usuario
[Quien, que, para que - en formato "Como [usuario], quiero [accion], para [beneficio]"]

## Contexto Tecnico
[Stack detectado, archivos relevantes, patrones existentes basados en el repositorio]

## Plan de Implementacion
[Pasos numerados, especificos y accionables]

## Archivos a Modificar
[Lista de paths de archivos que probablemente necesitan cambios]

## Criterios de Aceptacion
[Checkbox list verificable con criterios claros]

## Notas Adicionales
[Consideraciones de edge cases, seguridad, performance, etc.]

---

REGLAS:
1. Se especifico - no uses terminos vagos como "mejorar" o "optimizar" sin detallar que significa exactamente
2. Prioriza cambios minimos - busca la solucion mas simple que cumpla los requisitos
3. Considera el stack existente - usa las librerias y patrones ya presentes en el repo
4. Incluye validaciones - considera casos de error y edge cases
5. Mantente dentro del alcance - no agregues funcionalidades que el usuario no pidio
`;

/**
 * Input for generating a spec.
 */
interface GenerateSpecInput {
  task_id: string;
  additional_context?: string;
}

/**
 * AI Provider configuration from request headers.
 */
interface AIProviderConfig {
  provider: 'claude' | 'openai' | 'openrouter';
  apiKey: string;
  model?: string; // Required for OpenRouter
}

// =============================================================================
// CLI Agent Support
// =============================================================================

/**
 * Valid AgentType values for runtime checking.
 */
const VALID_AGENT_TYPES: readonly string[] = ['claude-code', 'codex', 'copilot', 'gemini'];

/**
 * Checks if a string is a valid AgentType.
 */
function isValidAgentType(value: string): value is AgentType {
  return VALID_AGENT_TYPES.includes(value);
}

/**
 * Checks if a CLI agent is configured and available for use.
 *
 * Priority order:
 * 1. Task-level agent_type/agent_model (if provided)
 * 2. Global default agent from settings service
 *
 * @param taskAgentType - Optional agent type from the task
 * @param taskAgentModel - Optional agent model from the task
 * @returns The agent type and model if available, null otherwise
 */
async function getAvailableCLIAgent(
  taskAgentType?: string | null,
  taskAgentModel?: string | null
): Promise<{ agentType: AgentType; model: string | null; source: 'task' | 'default' } | null> {
  // Priority 1: Task-level agent override
  if (taskAgentType && isValidAgentType(taskAgentType)) {
    logger.info('PM Agent: Checking task-level CLI agent', { agentType: taskAgentType, agentModel: taskAgentModel });
    try {
      const detected = await detectAgent(taskAgentType);
      if (detected.installed && detected.authenticated) {
        logger.info('PM Agent: Using task-level CLI agent', { agentType: taskAgentType, model: taskAgentModel });
        return { agentType: taskAgentType, model: taskAgentModel ?? null, source: 'task' };
      }
      logger.warn('PM Agent: Task-level CLI agent not available, will try default', {
        agentType: taskAgentType,
        installed: detected.installed,
        authenticated: detected.authenticated,
      });
    } catch (error) {
      logger.warn('PM Agent: Failed to detect task-level CLI agent, will try default', {
        agentType: taskAgentType,
        error: getErrorMessage(error),
      });
    }
  } else if (taskAgentType) {
    logger.warn('PM Agent: Task has invalid agent_type, ignoring', { agentType: taskAgentType });
  }

  // Priority 2: Global default agent from settings
  const { agentType, agentModel } = settingsService.getDefaultAgent();
  if (!agentType) return null;

  try {
    const detected = await detectAgent(agentType as AgentType);
    if (detected.installed && detected.authenticated) {
      logger.info('PM Agent: Using default CLI agent', { agentType, model: agentModel });
      return { agentType: agentType as AgentType, model: agentModel, source: 'default' };
    }
    logger.debug('CLI agent configured but not available', { agentType, installed: detected.installed, authenticated: detected.authenticated });
    return null;
  } catch (error) {
    logger.debug('Failed to detect CLI agent', { agentType, error: getErrorMessage(error) });
    return null;
  }
}

/**
 * Builds the CLI command and arguments for spec generation.
 * The prompt is included directly in args to avoid stdin piping issues on Windows.
 */
function buildSpecCommand(agentType: AgentType, model: string | null, prompt: string): { command: string; args: string[]; useStdin: boolean } {
  switch (agentType) {
    case 'claude-code':
      return {
        command: 'claude',
        args: [
          '-p',
          prompt,
          '--output-format', 'stream-json',
          '--verbose',
          '--max-turns', '2',
          '--system-prompt', PM_AGENT_SYSTEM_PROMPT,
          ...(model ? ['--model', model] : []),
        ],
        useStdin: false,
      };
    case 'codex':
      return {
        command: 'codex',
        args: [
          'exec',
          '--json',
          '--skip-git-repo-check',
          ...(model ? ['-m', model] : []),
          '-', // read prompt from stdin (codex requires explicit -)
        ],
        useStdin: true,
      };
    case 'copilot':
      return {
        command: 'copilot',
        args: [prompt],
        useStdin: false,
      };
    case 'gemini':
      return {
        command: 'gemini',
        args: [
          '-p',
          prompt,
          ...(model ? ['--model', model] : []),
        ],
        useStdin: false,
      };
    default:
      throw new Error(`Unsupported CLI agent type: ${agentType}`);
  }
}

/**
 * Parses CLI output to extract the generated spec text.
 * Different CLIs have different output formats.
 */
function parseCLIOutput(agentType: AgentType, stdout: string): string {
  switch (agentType) {
    case 'claude-code': {
      // With --output-format stream-json, output is NDJSON (one JSON object per line).
      // Scan for the "result" event and collect "assistant" text as fallback.
      const lines = stdout.trim().split('\n');
      const assistantTexts: string[] = [];

      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);

          // Collect assistant messages (partial text output)
          if (parsed.type === 'assistant') {
            const content = typeof parsed.content === 'string' ? parsed.content : null;
            // Also handle content_block with text
            const message = parsed.message;
            if (content) {
              assistantTexts.push(content);
            } else if (message && typeof message === 'object' && Array.isArray(message.content)) {
              const text = (message.content as Array<{ type: string; text: string }>)
                .filter((b: { type: string }) => b.type === 'text')
                .map((b: { text: string }) => b.text)
                .join('');
              if (text) assistantTexts.push(text);
            }
          }

          // Check for result line
          if (parsed.type === 'result') {
            // Success: result field contains the final text
            if (typeof parsed.result === 'string' && parsed.result.length > 0) {
              return parsed.result;
            }

            // Error subtypes (error_max_turns, etc.)
            if (parsed.subtype && String(parsed.subtype).startsWith('error')) {
              // Try to use accumulated assistant text as partial spec
              if (assistantTexts.length > 0) {
                return assistantTexts.join('\n');
              }
              // No usable text — throw a descriptive error
              const errorDetail = parsed.subtype === 'error_max_turns'
                ? 'The agent hit the max turns limit without producing a complete specification. This usually means it tried to use tools instead of generating text directly.'
                : `The agent encountered an error: ${parsed.subtype}`;
              throw new Error(errorDetail);
            }

            // result exists but is not a string (e.g., null) — fall through to assistantTexts
          }
        } catch (e) {
          // Re-throw our own errors (from the error subtype handling above)
          if (e instanceof Error && !e.message.includes('JSON')) throw e;
          // Skip JSON parse errors — line might not be valid JSON
        }
      }

      // No result line found — use accumulated assistant text if available
      if (assistantTexts.length > 0) {
        return assistantTexts.join('\n');
      }

      // Last resort: try parsing entire stdout as single JSON (legacy --output-format json compat)
      try {
        const parsed = JSON.parse(stdout);
        if (typeof parsed.result === 'string' && parsed.result.length > 0) return parsed.result;
        if (Array.isArray(parsed.content)) {
          const text = parsed.content
            .filter((b: { type: string }) => b.type === 'text')
            .map((b: { text: string }) => b.text)
            .join('\n');
          if (text) return text;
        }
      } catch {
        // ignore
      }

      return stdout.trim();
    }
    case 'codex': {
      // Codex --json outputs NDJSON events. The spec text is in the last
      // "item.completed" event where item.type is "message" or "agent_message".
      // The text may be in item.text or item.content[].text.
      try {
        const lines = stdout.trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          const parsed = JSON.parse(lines[i]!);

          // Handle item.completed events (actual Codex --json format)
          if (parsed.type === 'item.completed' && parsed.item) {
            const item = parsed.item as {
              type?: string;
              text?: string;
              content?: Array<{ type?: string; text?: string }>;
            };
            if (item.type === 'agent_message' || item.type === 'message') {
              // Text may be directly on item.text
              if (item.text) return item.text;
              // Or in item.content array (output_text blocks)
              if (Array.isArray(item.content)) {
                const text = item.content
                  .filter((c) => c.text)
                  .map((c) => c.text)
                  .join('');
                if (text) return text;
              }
            }
          }

          // Legacy / simple format fallback
          if (parsed.type === 'message' && parsed.content) return parsed.content as string;
          if (parsed.output) return parsed.output as string;
        }
        return stdout.trim();
      } catch {
        return stdout.trim();
      }
    }
    case 'copilot':
      return stdout.trim();
    case 'gemini': {
      try {
        const lines = stdout.trim().split('\n');
        const textParts: string[] = [];
        for (const line of lines) {
          const parsed = JSON.parse(line);
          if (parsed.text) textParts.push(parsed.text);
          if (parsed.content) textParts.push(parsed.content);
        }
        return textParts.length > 0 ? textParts.join('') : stdout.trim();
      } catch {
        return stdout.trim();
      }
    }
    default:
      return stdout.trim();
  }
}

/**
 * Calls a CLI agent to generate a spec.
 *
 * For Claude Code and Gemini: prompt is passed as a CLI argument (fast, no stdin issues).
 * For Codex: prompt is piped via stdin (requires explicit `-` arg).
 *
 * On Windows, npm-installed CLIs (codex, copilot) are .cmd wrappers that need
 * shell: true. Native binaries (claude, gemini) use shell: false to preserve
 * argument integrity (long prompts with newlines break under cmd.exe).
 */
/**
 * Extracts a human-readable progress line from raw CLI stdout.
 * Returns null if the line doesn't contain meaningful progress info.
 */
function extractProgressLine(agentType: AgentType, line: string): string | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const type = parsed.type as string | undefined;

    switch (agentType) {
      case 'claude-code': {
        // stream-json format
        if (type === 'assistant') {
          const content = parsed.content as string | undefined;
          if (content) return `Agent: ${content.substring(0, 300)}`;
        }
        if (type === 'tool_use') {
          const name = parsed.name as string | undefined;
          const input = parsed.input as Record<string, unknown> | undefined;
          let detail = '';
          if (input) {
            const key = input.file_path ?? input.command ?? input.pattern ?? input.path;
            if (typeof key === 'string') detail = `: ${key.substring(0, 150)}`;
          }
          return `Tool: ${name ?? 'unknown'}${detail}`;
        }
        if (type === 'result') {
          const result = parsed.result as string | undefined;
          if (result) return `Result: ${result.substring(0, 300)}`;
        }
        break;
      }
      case 'codex': {
        // JSONL format: item.started, item.completed, turn.completed events
        // Each event has an `item` with type, name, text, content, output, arguments
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
            const text = item.text ?? item.content?.filter(c => c.text).map(c => c.text).join('');
            if (text) return `Agent: ${text.substring(0, 300)}`;
            // Started without text yet — brief indicator
            return type === 'item.started' ? 'Agent is thinking...' : null;
          }

          // Function/tool calls — show tool name and key argument
          if (itemType === 'function_call' || itemType === 'tool_use') {
            const toolName = item.name ?? 'unknown';
            let detail = '';
            if (item.arguments) {
              try {
                const args = JSON.parse(item.arguments) as Record<string, unknown>;
                const key = args.file_path ?? args.command ?? args.path ?? args.pattern ?? args.query;
                if (typeof key === 'string') detail = `: ${key.substring(0, 150)}`;
              } catch { /* not JSON */ }
            }
            return `Tool: ${toolName}${detail}`;
          }

          // Function/tool outputs — show briefly
          if (itemType === 'function_call_output') {
            const output = item.output ?? item.text;
            if (output) return `Tool result (${output.length} chars)`;
            return null;
          }

          // Other item types with text — show the text
          if (item.text) return `${itemType ?? 'Output'}: ${item.text.substring(0, 200)}`;
          // Skip events with no useful content (avoid noisy "Event: item.completed")
          return null;
        }

        // turn.completed — useful milestone
        if (type === 'turn.completed') return 'Turn completed';

        // Top-level text content
        const msg = (parsed.message ?? parsed.content ?? parsed.text) as string | undefined;
        if (msg) return `Agent: ${msg.substring(0, 300)}`;

        // Skip other events without useful content
        return null;
      }
      case 'gemini': {
        // ndjson format with text/content fields
        const text = (parsed.text ?? parsed.content) as string | undefined;
        if (text) return `Agent: ${text.substring(0, 300)}`;
        if (type) return `Event: ${type}`;
        break;
      }
      case 'copilot': {
        // May output structured data
        const msg = (parsed.message ?? parsed.content ?? parsed.text) as string | undefined;
        if (msg) return `Agent: ${msg.substring(0, 300)}`;
        break;
      }
    }
    return null;
  } catch {
    // Not JSON — for copilot (raw text output), return the line as-is
    if (agentType === 'copilot' && line.length > 0) {
      return line.substring(0, 300);
    }
    return null;
  }
}

async function callCLIForSpec(
  agentType: AgentType,
  model: string | null,
  userMessage: string,
  onProgress?: (message: string) => void,
  taskId?: string,
  cwd?: string
): Promise<GenerateSpecResponse> {
  // For agents that use stdin, combine system prompt + user message
  const fullPrompt = `${PM_AGENT_SYSTEM_PROMPT}\n\n---\n\n${userMessage}`;

  const { command, args, useStdin } = buildSpecCommand(agentType, model, userMessage);

  logger.info('PM Agent: Calling CLI for spec', { agentType, command, model, useStdin });

  return new Promise((resolve, reject) => {
    // npm-installed CLIs (codex, copilot) are .cmd wrappers on Windows — need shell.
    // Native binaries (claude, gemini) must NOT use shell to preserve arg integrity.
    // For copilot on Windows: use PowerShell + temp file workaround for multiline prompts.
    const needsWindowsWorkaround =
      process.platform === 'win32' && (command === 'codex' || command === 'copilot');

    let promptFilePath: string | null = null;
    let spawnCommand: string;
    let spawnArgs: string[];
    let useShell = false;

    if (needsWindowsWorkaround) {
      promptFilePath = join(tmpdir(), `pm-agent-prompt-${randomUUID()}.txt`);
      writeFileSync(promptFilePath, userMessage, 'utf8');
      const escapedPath = promptFilePath.replace(/'/g, "''");

      let innerCmd: string;
      switch (command) {
        case 'codex': {
          const modelArg = model ? `-m '${model}' ` : '';
          innerCmd = `& codex exec --json --skip-git-repo-check ${modelArg}$p`;
          break;
        }
        case 'copilot':
          innerCmd = `& copilot $p`;
          break;
        default:
          innerCmd = `& ${command} $p`;
      }

      const psCommand = `$p = [IO.File]::ReadAllText('${escapedPath}'); ${innerCmd}; exit $LASTEXITCODE`;
      spawnCommand = 'powershell.exe';
      spawnArgs = ['-NoProfile', '-NonInteractive', '-Command', psCommand];
      onProgress?.('Using PowerShell workaround for Windows .cmd wrapper');
    } else {
      spawnCommand = command;
      spawnArgs = args;
    }

    const proc = spawn(spawnCommand, spawnArgs, {
      shell: useShell,
      windowsHide: true,
      stdio: [useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      cwd: cwd || tmpdir(),
    });

    // Track process for cancellation support
    if (taskId) {
      activeSpecProcesses.set(taskId, proc);
    }

    let stdout = '';
    let stderr = '';
    let hasReceivedOutput = false;

    const startTime = Date.now();

    // Claude Code CLI in -p mode doesn't stream intermediate events during
    // single-turn text generation — it buffers everything and emits at the end.
    // Other CLIs (Codex, Gemini) stream events in real-time.
    // Adapt heartbeat messages accordingly.
    const isNonStreamingCLI = agentType === 'claude-code';
    if (isNonStreamingCLI) {
      const modelLabel = model || 'default';
      onProgress?.(`Calling Claude Code (model: ${modelLabel}). Output will appear when generation completes.`);
    }

    const heartbeat = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (isNonStreamingCLI && !hasReceivedOutput) {
        // Rotate through informative messages instead of repeating the same line
        const messages = [
          `Generating spec... (${elapsed}s)`,
          `Claude Code is thinking... (${elapsed}s)`,
          `Waiting for response... (${elapsed}s)`,
        ];
        const idx = Math.floor(elapsed / 15) % messages.length;
        onProgress?.(messages[idx]!);
      } else if (!hasReceivedOutput) {
        onProgress?.(`Generating... (${elapsed}s elapsed)`);
      }
      // Once we're receiving output, no need for heartbeat messages
    }, 15_000);

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`CLI agent (${agentType}) timed out after 300 seconds`));
    }, 300_000);

    let stdoutBuffer = '';
    proc.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      stdoutBuffer += chunk;

      // Parse complete lines and forward progress to SSE
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const summary = extractProgressLine(agentType, trimmed);
        if (summary) {
          if (!hasReceivedOutput) {
            hasReceivedOutput = true;
            // For non-streaming CLIs, announce that output has arrived
            if (isNonStreamingCLI) {
              onProgress?.('Received response from Claude Code, processing...');
            }
          }
          onProgress?.(summary);
        }
      }
    });
    proc.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      // Forward non-empty stderr lines as progress updates
      const lines = chunk.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        onProgress?.(line);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      if (taskId) activeSpecProcesses.delete(taskId);
      if (promptFilePath) {
        try { unlinkSync(promptFilePath); } catch { /* ignore */ }
      }
      reject(err);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      if (taskId) activeSpecProcesses.delete(taskId);
      if (promptFilePath) {
        try { unlinkSync(promptFilePath); } catch { /* ignore */ }
      }
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      onProgress?.(`CLI completed in ${elapsed}s`);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `CLI exited with code ${code}`));
      } else {
        try {
          const spec = parseCLIOutput(agentType, stdout);
          if (!spec || spec.trim().length === 0) {
            reject(new Error('CLI agent completed but produced no output. The model may need more turns or an API key for direct API access.'));
            return;
          }
          resolve({
            spec,
            model_used: `${agentType}${model ? `:${model}` : ''}`,
            tokens_used: 0,
          });
        } catch (parseError) {
          reject(parseError);
        }
      }
    });

    // Only pipe via stdin for agents that need it (Codex)
    if (useStdin && proc.stdin) {
      proc.stdin.write(fullPrompt);
      proc.stdin.end();
    }
  });
}

// =============================================================================
// Spec Generation
// =============================================================================

/**
 * Generates a spec for a task using the PM Agent.
 *
 * Tries CLI agent first (if configured and available), then falls back to API.
 *
 * @param input - The input for spec generation
 * @param aiConfig - AI provider configuration (optional if CLI agent is available)
 * @returns The generated spec response
 */
export async function generateSpec(
  input: GenerateSpecInput,
  aiConfig?: AIProviderConfig
): Promise<GenerateSpecResponse> {
  const { task_id, additional_context } = input;

  logger.info('PM Agent: Starting spec generation', { task_id });

  // Prevent concurrent spec generation for the same task
  if (activeSpecProcesses.has(task_id)) {
    logger.warn('PM Agent: Spec generation already in progress, skipping', { task_id });
    throw new Error('Spec generation is already in progress for this task. Please wait or cancel first.');
  }

  // Get the task
  const task = taskService.getById(task_id);
  if (!task) {
    throw new Error(`Task not found: ${task_id}`);
  }

  // Validate task status
  if (task.status !== 'draft' && task.status !== 'pending_approval') {
    throw new Error(`Cannot generate spec for task with status: ${task.status}. Expected: draft or pending_approval`);
  }

  // Get repository information if available
  let repository: Repository | null = null;
  if (task.repository_id) {
    const repoService = getRepoService();
    repository = await repoService.getRepositoryById(task.repository_id);
  }

  // Update task status to refining and clear any previous error
  taskService.update(task_id, { status: 'refining', error: null });

  // Emit SSE status update
  const sseEmitter = getSSEEmitter();
  sseEmitter.emitStatus(task_id, 'refining');
  sseEmitter.emitLog(task_id, 'info', 'PM Agent: Analyzing your request...');

  try {
    // Build the context for the PM Agent
    const context = buildContext(task, repository);

    // Build the user message
    const userMessage = buildUserMessage(task.user_input || task.description, additional_context, context);

    // Try CLI agent first (task-level, then default), then fallback to API
    let result: GenerateSpecResponse;

    logger.info('PM Agent: Resolving agent for spec generation', {
      task_id,
      taskAgentType: task.agent_type,
      taskAgentModel: task.agent_model,
      hasApiConfig: !!aiConfig,
    });

    const cliAgent = await getAvailableCLIAgent(task.agent_type, task.agent_model);

    // Claude Code: use Anthropic API directly for spec generation.
    // The CLI tries to use tools (Read, Bash, Glob) which get permission-denied,
    // wasting time and money. We already have the repo context in the prompt.
    if (cliAgent?.agentType === 'claude-code' && aiConfig?.provider === 'claude') {
      const modelLabel = cliAgent.model || 'default';
      sseEmitter.emitLog(task_id, 'info', `PM Agent: Generating specification via Anthropic API (${modelLabel})...`);
      result = await callClaude(aiConfig.apiKey, userMessage, cliAgent.model ?? undefined);
    } else if (cliAgent?.agentType === 'claude-code' && !aiConfig) {
      // Claude Code selected but no API key — fall back to CLI with a warning
      const modelLabel = cliAgent.model || 'default';
      sseEmitter.emitLog(task_id, 'info', `PM Agent: Generating specification using Claude Code CLI (model: ${modelLabel})...`);
      try {
        result = await callCLIForSpec(cliAgent.agentType, cliAgent.model, userMessage, (msg) => {
          sseEmitter.emitLog(task_id, 'info', `[${cliAgent.agentType}] ${msg}`);
        }, task_id);
      } catch (cliError) {
        throw new Error(`Claude Code CLI failed and no API fallback configured: ${getErrorMessage(cliError)}`);
      }
    } else if (cliAgent) {
      // Other CLI agents (codex, gemini, copilot) — use CLI as before
      const sourceLabel = cliAgent.source === 'task' ? 'task-configured' : 'default';
      const modelLabel = cliAgent.model ? ` (model: ${cliAgent.model})` : '';
      sseEmitter.emitLog(task_id, 'info', `PM Agent: Generating specification using ${sourceLabel} ${cliAgent.agentType} CLI${modelLabel}...`);
      try {
        result = await callCLIForSpec(cliAgent.agentType, cliAgent.model, userMessage, (msg) => {
          sseEmitter.emitLog(task_id, 'info', `[${cliAgent.agentType}] ${msg}`);
        }, task_id);
      } catch (cliError) {
        logger.warn('PM Agent: CLI agent failed, trying API fallback', {
          agentType: cliAgent.agentType,
          source: cliAgent.source,
          error: getErrorMessage(cliError),
        });
        sseEmitter.emitLog(task_id, 'warn', `CLI agent (${cliAgent.agentType}) failed, falling back to API...`);
        if (!aiConfig) {
          throw new Error(`CLI agent (${cliAgent.agentType}) failed and no API fallback configured: ${getErrorMessage(cliError)}`);
        }
        sseEmitter.emitLog(task_id, 'info', `PM Agent: Generating specification using ${aiConfig.provider} API...`);
        result = await callAIProvider(aiConfig, userMessage);
      }
    } else if (aiConfig) {
      sseEmitter.emitLog(task_id, 'info', `PM Agent: Generating specification using ${aiConfig.provider} API...`);
      result = await callAIProvider(aiConfig, userMessage);
    } else {
      throw new Error('No CLI agent available and no API configuration provided. Please configure a CLI agent or provide API credentials.');
    }

    // Update task with the generated spec
    taskService.updateSpec(task_id, result.spec, true);

    // Emit completion
    sseEmitter.emitLog(task_id, 'info', 'PM Agent: Specification generated successfully!');
    sseEmitter.emitStatus(task_id, 'pending_approval');

    logger.info('PM Agent: Spec generated successfully', {
      task_id,
      model_used: result.model_used,
      tokens_used: result.tokens_used,
    });

    return result;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error('PM Agent: Failed to generate spec', { task_id, error: errorMessage });

    // Revert status to draft on error
    taskService.update(task_id, { status: 'draft', error: errorMessage });
    sseEmitter.emitStatus(task_id, 'draft');
    sseEmitter.emitError(task_id, `PM Agent error: ${errorMessage}`);

    throw error;
  }
}

/**
 * Builds the context string from repository information.
 */
function buildContext(task: Task, repository: Repository | null): string {
  const parts: string[] = [];

  if (repository) {
    parts.push(`## Repositorio: ${repository.name}`);
    parts.push(`URL: ${repository.url}`);
    parts.push(`Branch principal: ${repository.default_branch}`);

    // Add detected stack
    const stack = repository.detected_stack;
    if (stack.framework || stack.state_management || stack.styling || stack.testing) {
      parts.push('\n### Stack Detectado:');
      if (stack.framework) parts.push(`- Framework: ${stack.framework}`);
      if (stack.state_management) parts.push(`- State Management: ${stack.state_management}`);
      if (stack.styling) parts.push(`- Styling: ${stack.styling}`);
      if (stack.testing) parts.push(`- Testing: ${stack.testing}`);
    }

    // Add conventions if available
    if (repository.conventions && repository.conventions.trim()) {
      parts.push('\n### Convenciones del Proyecto:');
      parts.push(repository.conventions);
    }

    // Add learned patterns if available
    if (repository.learned_patterns && repository.learned_patterns.length > 0) {
      parts.push('\n### Patrones Aprendidos:');
      for (const pattern of repository.learned_patterns) {
        parts.push(`- ${pattern.pattern}`);
      }
    }
  } else if (task.repo_url) {
    parts.push(`## Repositorio: ${task.repo_url}`);
    parts.push(`Branch: ${task.target_branch}`);
  }

  // Add context files if specified
  if (task.context_files && task.context_files.length > 0) {
    parts.push('\n### Archivos de Contexto:');
    for (const file of task.context_files) {
      parts.push(`- ${file}`);
    }
  }

  // Add build command if specified
  if (task.build_command) {
    parts.push(`\n### Comando de Build: \`${task.build_command}\``);
  }

  return parts.join('\n');
}

/**
 * Builds the user message for the PM Agent.
 */
function buildUserMessage(userInput: string, additionalContext?: string, repoContext?: string): string {
  const parts: string[] = [];

  parts.push('# Solicitud del Usuario');
  parts.push(userInput);

  if (additionalContext) {
    parts.push('\n# Contexto Adicional');
    parts.push(additionalContext);
  }

  if (repoContext) {
    parts.push('\n# Informacion del Repositorio');
    parts.push(repoContext);
  }

  parts.push('\n---');
  parts.push('Por favor, genera una especificacion detallada siguiendo el formato establecido.');

  return parts.join('\n');
}

/**
 * Calls the AI provider to generate a spec.
 */
async function callAIProvider(
  config: AIProviderConfig,
  userMessage: string
): Promise<GenerateSpecResponse> {
  if (config.provider === 'claude') {
    return callClaude(config.apiKey, userMessage);
  } else if (config.provider === 'openai') {
    return callOpenAI(config.apiKey, userMessage);
  } else if (config.provider === 'openrouter') {
    if (!config.model) {
      throw new Error('OpenRouter requires a model to be specified');
    }
    return callOpenRouterProvider(config.apiKey, config.model, userMessage);
  } else {
    throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}

/**
 * Calls Claude API to generate a spec.
 */
async function callClaude(apiKey: string, userMessage: string, model?: string): Promise<GenerateSpecResponse> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      system: PM_AGENT_SYSTEM_PROMPT,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
    model: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  const spec = data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return {
    spec,
    model_used: data.model,
    tokens_used: data.usage.input_tokens + data.usage.output_tokens,
  };
}

/**
 * Calls OpenAI API to generate a spec.
 */
async function callOpenAI(apiKey: string, userMessage: string): Promise<GenerateSpecResponse> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [
        {
          role: 'system',
          content: PM_AGENT_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  const spec = data.choices[0]?.message?.content ?? '';

  return {
    spec,
    model_used: data.model,
    tokens_used: data.usage.total_tokens,
  };
}

/**
 * Calls OpenRouter API to generate a spec.
 */
async function callOpenRouterProvider(
  apiKey: string,
  model: string,
  userMessage: string
): Promise<GenerateSpecResponse> {
  const result = await callOpenRouter(apiKey, model, [
    {
      role: 'system',
      content: PM_AGENT_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: userMessage,
    },
  ]);

  return {
    spec: result.spec,
    model_used: result.model_used,
    tokens_used: result.tokens_used,
  };
}

/**
 * Regenerates the spec for a task (when user wants a different approach).
 */
export async function regenerateSpec(
  taskId: string,
  aiConfig?: AIProviderConfig,
  additionalContext?: string
): Promise<GenerateSpecResponse> {
  logger.info('PM Agent: Regenerating spec', { taskId });

  // Update task status back to draft first, then generate
  taskService.update(taskId, {
    status: 'draft',
    generated_spec: null,
    generated_spec_at: null,
    final_spec: null,
    was_spec_edited: false,
  });

  return generateSpec(
    additionalContext
      ? { task_id: taskId, additional_context: additionalContext }
      : { task_id: taskId },
    aiConfig
  );
}

/**
 * Cancels an in-progress spec generation by killing the CLI child process.
 * @param taskId - The task ID to cancel
 * @returns true if a process was found and killed, false otherwise
 */
export function cancelSpecGeneration(taskId: string): boolean {
  const proc = activeSpecProcesses.get(taskId);
  if (proc) {
    proc.kill();
    activeSpecProcesses.delete(taskId);
    logger.info('PM Agent: Cancelled spec generation CLI process', { taskId });
    return true;
  }
  return false;
}

export default {
  generateSpec,
  regenerateSpec,
  cancelSpecGeneration,
};
