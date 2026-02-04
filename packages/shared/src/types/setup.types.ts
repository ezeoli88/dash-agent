import type { AIProvider } from '../schemas/setup.schema.js';

// ============================================================================
// AI Provider Info
// ============================================================================

/**
 * Display information for AI providers
 */
export interface AIProviderInfo {
  id: AIProvider;
  name: string;
  description: string;
  icon: string;
  apiKeyPrefix: string;
  apiKeyPlaceholder: string;
  docsUrl: string;
}

/**
 * AI provider information for UI display
 */
export const AI_PROVIDER_INFO: Record<AIProvider, AIProviderInfo> = {
  claude: {
    id: 'claude',
    name: 'Claude',
    description: 'Anthropic Claude - Usa tu API key',
    icon: 'claude',
    apiKeyPrefix: 'sk-ant-',
    apiKeyPlaceholder: 'sk-ant-api...',
    docsUrl: 'https://console.anthropic.com/account/keys',
  },
  openai: {
    id: 'openai',
    name: 'ChatGPT',
    description: 'OpenAI GPT-4 - Usa tu API key',
    icon: 'openai',
    apiKeyPrefix: 'sk-',
    apiKeyPlaceholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Modelos gratuitos (Llama, Gemma, Mistral y mas)',
    icon: 'openrouter',
    apiKeyPrefix: 'sk-or-',
    apiKeyPlaceholder: 'sk-or-v1-...',
    docsUrl: 'https://openrouter.ai/keys',
  },
};

// ============================================================================
// Setup Step Tracking
// ============================================================================

/**
 * Setup wizard steps
 */
export type SetupStep = 'ai-provider' | 'github' | 'complete';

/**
 * Step status for tracking progress
 */
export type StepStatus = 'pending' | 'in-progress' | 'completed' | 'error';

/**
 * Setup step with status
 */
export interface SetupStepInfo {
  id: SetupStep;
  title: string;
  description: string;
  status: StepStatus;
}

// ============================================================================
// Validation States
// ============================================================================

/**
 * API key validation state
 */
export type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid';

/**
 * GitHub connection state
 */
export type GitHubConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Setup-specific error codes
 */
export const SETUP_ERROR_CODES = {
  INVALID_API_KEY: 'INVALID_API_KEY',
  API_KEY_EXPIRED: 'API_KEY_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  GITHUB_OAUTH_FAILED: 'GITHUB_OAUTH_FAILED',
  GITHUB_TOKEN_EXPIRED: 'GITHUB_TOKEN_EXPIRED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type SetupErrorCode = typeof SETUP_ERROR_CODES[keyof typeof SETUP_ERROR_CODES];

/**
 * Setup error with code and message
 */
export interface SetupError {
  code: SetupErrorCode;
  message: string;
  details?: string;
}
