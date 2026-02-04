import { createLogger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errors.js';
import { getRepoService, type Repository } from './repo.service.js';
import { taskService, type Task } from './task.service.js';
import { getSSEEmitter } from '../utils/sse-emitter.js';
import { callOpenRouter } from './ai-provider.service.js';
import type { GenerateSpecResponse } from '@dash-agent/shared';

const logger = createLogger('pm-agent-service');

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

/**
 * Generates a spec for a task using the PM Agent.
 *
 * @param input - The input for spec generation
 * @param aiConfig - AI provider configuration from request headers
 * @returns The generated spec response
 */
export async function generateSpec(
  input: GenerateSpecInput,
  aiConfig: AIProviderConfig
): Promise<GenerateSpecResponse> {
  const { task_id, additional_context } = input;

  logger.info('PM Agent: Starting spec generation', { task_id });

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

  // Update task status to refining
  taskService.update(task_id, { status: 'refining' });

  // Emit SSE status update
  const sseEmitter = getSSEEmitter();
  sseEmitter.emitStatus(task_id, 'refining');
  sseEmitter.emitLog(task_id, 'info', 'PM Agent: Analyzing your request...');

  try {
    // Build the context for the PM Agent
    const context = buildContext(task, repository);

    // Build the user message
    const userMessage = buildUserMessage(task.user_input || task.description, additional_context, context);

    // Call the AI provider
    sseEmitter.emitLog(task_id, 'info', `PM Agent: Generating specification using ${aiConfig.provider}...`);

    const result = await callAIProvider(aiConfig, userMessage);

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
async function callClaude(apiKey: string, userMessage: string): Promise<GenerateSpecResponse> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
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
  aiConfig: AIProviderConfig,
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

export default {
  generateSpec,
  regenerateSpec,
};
