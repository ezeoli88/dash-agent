// Components
export {
  SetupScreen,
  SetupComplete,
  AIProviderCard,
  ApiKeyDialog,
  GitHubConnect,
  SetupGuard,
} from './components'

// Hooks
export {
  useSetupStatus,
  useValidateKey,
  useGitHubAuthUrl,
  useGitHubCallback,
  useGitHubConnect,
} from './hooks'

// Store
export { useSetupStore } from './stores/setup-store'

// Types
export type {
  AIProvider,
  ValidateAIKeyRequest,
  ValidateAIKeyResponse,
  GitHubAuthUrlResponse,
  GitHubCallbackRequest,
  GitHubCallbackResponse,
  SetupStatus,
  DisconnectResponse,
  SetupConfig,
  AIProviderInfo,
  SetupStep,
  StepStatus,
  SetupStepInfo,
  ValidationState,
  GitHubConnectionState,
  SetupErrorCode,
  SetupError,
} from './types'

export {
  AI_PROVIDERS,
  DEFAULT_SETUP_CONFIG,
  AI_PROVIDER_INFO,
  SETUP_ERROR_CODES,
} from './types'
