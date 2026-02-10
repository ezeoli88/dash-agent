import { createLogger } from '../utils/logger.js';
import type {
  AIProvider,
  ValidateAIKeyResponse,
  OpenRouterModel,
  ValidateOpenRouterKeyResponse,
} from '@dash-agent/shared';
import { getAICredentials } from './secrets.service.js';

const logger = createLogger('services:ai-provider');

/**
 * Model information for validation response
 */
interface ModelInfo {
  name: string;
  description: string;
}

/**
 * Validates a Claude API key by making a test request to the Anthropic API.
 *
 * @param apiKey - The Claude API key to validate
 * @returns Promise resolving to validation result
 */
async function validateClaudeKey(apiKey: string): Promise<ValidateAIKeyResponse> {
  logger.debug('Validating Claude API key');

  try {
    // Make a minimal request to the Claude API to check if the key is valid
    // We use the messages endpoint with a small message to minimize cost
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [
          { role: 'user', content: 'Hi' }
        ],
      }),
    });

    if (response.ok) {
      logger.info('Claude API key validated successfully');
      return {
        valid: true,
        provider: 'claude',
        modelInfo: {
          name: 'Claude 3.5 Sonnet',
          description: 'Most capable Claude model for coding tasks',
        },
      };
    }

    // Handle specific error cases
    if (response.status === 401) {
      logger.warn('Claude API key validation failed: Invalid key');
      return {
        valid: false,
        provider: 'claude',
        error: 'Invalid API key. Please check your key and try again.',
      };
    }

    if (response.status === 403) {
      logger.warn('Claude API key validation failed: Forbidden');
      return {
        valid: false,
        provider: 'claude',
        error: 'API key does not have permission to access this resource.',
      };
    }

    if (response.status === 429) {
      // Rate limited but key is valid
      logger.info('Claude API key validated (rate limited, but key is valid)');
      return {
        valid: true,
        provider: 'claude',
        modelInfo: {
          name: 'Claude 3.5 Sonnet',
          description: 'Most capable Claude model for coding tasks',
        },
      };
    }

    // Try to get error message from response
    const errorBody = await response.text();
    logger.warn('Claude API key validation failed', { status: response.status, body: errorBody });

    return {
      valid: false,
      provider: 'claude',
      error: `Validation failed: ${response.statusText}`,
    };
  } catch (error) {
    logger.error('Claude API key validation error', {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      valid: false,
      provider: 'claude',
      error: error instanceof Error ? error.message : 'Network error while validating API key',
    };
  }
}

/**
 * Validates an OpenAI API key by making a test request to the OpenAI API.
 *
 * @param apiKey - The OpenAI API key to validate
 * @returns Promise resolving to validation result
 */
async function validateOpenAIKey(apiKey: string): Promise<ValidateAIKeyResponse> {
  logger.debug('Validating OpenAI API key');

  try {
    // Make a minimal request to the OpenAI API to check if the key is valid
    // We use the models endpoint which is free to call
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      logger.info('OpenAI API key validated successfully');
      return {
        valid: true,
        provider: 'openai',
        modelInfo: {
          name: 'GPT-4o',
          description: 'Most capable OpenAI model for complex tasks',
        },
      };
    }

    // Handle specific error cases
    if (response.status === 401) {
      logger.warn('OpenAI API key validation failed: Invalid key');
      return {
        valid: false,
        provider: 'openai',
        error: 'Invalid API key. Please check your key and try again.',
      };
    }

    if (response.status === 429) {
      // Rate limited but key is valid
      logger.info('OpenAI API key validated (rate limited, but key is valid)');
      return {
        valid: true,
        provider: 'openai',
        modelInfo: {
          name: 'GPT-4o',
          description: 'Most capable OpenAI model for complex tasks',
        },
      };
    }

    // Try to get error message from response
    const errorBody = await response.text();
    logger.warn('OpenAI API key validation failed', { status: response.status, body: errorBody });

    return {
      valid: false,
      provider: 'openai',
      error: `Validation failed: ${response.statusText}`,
    };
  } catch (error) {
    logger.error('OpenAI API key validation error', {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      valid: false,
      provider: 'openai',
      error: error instanceof Error ? error.message : 'Network error while validating API key',
    };
  }
}

/**
 * Validates an API key for the specified AI provider.
 *
 * @param provider - The AI provider ('claude' or 'openai')
 * @param apiKey - The API key to validate
 * @returns Promise resolving to validation result
 */
export async function validateAPIKey(
  provider: AIProvider,
  apiKey: string
): Promise<ValidateAIKeyResponse> {
  logger.info('Validating API key', { provider });

  if (!apiKey || apiKey.trim() === '') {
    return {
      valid: false,
      provider,
      error: 'API key is required',
    };
  }

  switch (provider) {
    case 'claude':
      return validateClaudeKey(apiKey);
    case 'openai':
      return validateOpenAIKey(apiKey);
    default:
      return {
        valid: false,
        provider,
        error: `Unknown provider: ${provider}`,
      };
  }
}

/**
 * Gets model information for a provider without validating the key.
 * Useful for displaying information in the UI.
 *
 * @param provider - The AI provider
 * @returns Model information
 */
export function getModelInfo(provider: AIProvider): ModelInfo {
  switch (provider) {
    case 'claude':
      return {
        name: 'Claude 3.5 Sonnet',
        description: 'Most capable Claude model for coding tasks',
      };
    case 'openai':
      return {
        name: 'GPT-4o',
        description: 'Most capable OpenAI model for complex tasks',
      };
    case 'openrouter':
      return {
        name: 'OpenRouter',
        description: 'Access to multiple free AI models',
      };
    default:
      return {
        name: 'Unknown',
        description: 'Unknown provider',
      };
  }
}

// =============================================================================
// OpenRouter API Functions
// =============================================================================

/**
 * OpenRouter API base URL
 */
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Raw model data from OpenRouter API
 */
interface OpenRouterAPIModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  supported_parameters?: string[];
}

/**
 * Fetches available models from OpenRouter API
 *
 * @param apiKey - OpenRouter API key
 * @returns List of available models
 */
async function fetchOpenRouterModels(apiKey: string): Promise<OpenRouterAPIModel[]> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/models?supported_parameters=tools`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://dash-agent.local',
      'X-Title': 'dash-agent',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as { data: OpenRouterAPIModel[] };
  const models = data.data || [];
  // Extra safety: only return models that explicitly list 'tools' in supported_parameters
  return models.filter((m) =>
    !m.supported_parameters || m.supported_parameters.includes('tools')
  );
}

/**
 * Filters models to only return free ones (pricing.prompt = "0" and pricing.completion = "0")
 *
 * @param models - List of all models
 * @returns List of free models only
 */
function filterFreeModels(models: OpenRouterAPIModel[]): OpenRouterModel[] {
  return models
    .filter((model) => {
      const promptPrice = parseFloat(model.pricing?.prompt || '1');
      const completionPrice = parseFloat(model.pricing?.completion || '1');
      return promptPrice === 0 && completionPrice === 0;
    })
    .map((model) => ({
      id: model.id,
      name: model.name,
      pricing: model.pricing,
    }));
}

/**
 * Validates an OpenRouter API key and returns available models
 *
 * @param apiKey - The OpenRouter API key to validate
 * @returns Validation result with models if successful
 */
export async function validateOpenRouterKey(apiKey: string): Promise<ValidateOpenRouterKeyResponse> {
  logger.debug('Validating OpenRouter API key');

  try {
    const allModels = await fetchOpenRouterModels(apiKey);
    const freeModels = filterFreeModels(allModels);

    logger.info('OpenRouter API key validated successfully', {
      totalModels: allModels.length,
      freeModels: freeModels.length,
    });

    return {
      valid: true,
      models: allModels.map((m) => ({ id: m.id, name: m.name, pricing: m.pricing })),
      freeModels,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('OpenRouter API key validation failed', { error: errorMessage });

    // Check for specific error cases
    if (errorMessage.includes('401')) {
      return {
        valid: false,
        error: 'Invalid API key. Please check your key and try again.',
      };
    }

    return {
      valid: false,
      error: errorMessage,
    };
  }
}

/**
 * Gets available OpenRouter models (requires valid API key)
 *
 * @param apiKey - OpenRouter API key
 * @param freeOnly - If true, only return free models
 * @returns List of models
 */
export async function getOpenRouterModels(
  apiKey: string,
  freeOnly = true
): Promise<OpenRouterModel[]> {
  const allModels = await fetchOpenRouterModels(apiKey);

  if (freeOnly) {
    return filterFreeModels(allModels);
  }

  return allModels.map((m) => ({ id: m.id, name: m.name, pricing: m.pricing }));
}

/**
 * Message format for OpenRouter API (OpenAI compatible)
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Response from OpenRouter chat completion
 */
interface OpenRouterChatResponse {
  spec: string;
  model_used: string;
  tokens_used: number;
}

/**
 * Calls OpenRouter API for chat completion (OpenAI compatible format)
 *
 * @param apiKey - OpenRouter API key
 * @param model - Model ID to use
 * @param messages - Chat messages
 * @param maxTokens - Maximum tokens in response
 * @returns Chat completion response
 */
export async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens = 4096
): Promise<OpenRouterChatResponse> {
  logger.debug('Calling OpenRouter API', { model, messageCount: messages.length });

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://dash-agent.local',
      'X-Title': 'dash-agent',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  const content = data.choices[0]?.message?.content ?? '';

  return {
    spec: content,
    model_used: data.model || model,
    tokens_used: data.usage?.total_tokens || 0,
  };
}

// =============================================================================
// Server-Side Stored Credentials
// =============================================================================

/**
 * Gets the stored AI credentials from the secrets service.
 * Returns null if no AI provider is configured.
 *
 * @returns AI provider configuration with decrypted API key
 */
export function getStoredAICredentials(): { provider: AIProvider; apiKey: string; model?: string } | null {
  const credentials = getAICredentials();
  if (!credentials) {
    logger.debug('No stored AI credentials found');
    return null;
  }

  logger.debug('Retrieved stored AI credentials', { provider: credentials.provider });

  const result: { provider: AIProvider; apiKey: string; model?: string } = {
    provider: credentials.provider,
    apiKey: credentials.apiKey,
  };

  if (credentials.model) {
    result.model = credentials.model;
  }

  return result;
}

/**
 * Checks if AI credentials are stored in the server.
 *
 * @returns true if credentials are stored
 */
export function hasStoredAICredentials(): boolean {
  return getAICredentials() !== null;
}
