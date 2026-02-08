// Components
export {
  SetupScreen,
  SetupComplete,
  AIProviderCard,
  ApiKeyDialog,
  GitHubConnect,
  GitLabConnect,
  SetupGuard,
} from './components'

// Hooks
export {
  useSetupStatus,
  useValidateKey,
} from './hooks'

// Store
export { useSetupStore } from './stores/setup-store'

// Types
export type {
  AIProvider,
  ValidateAIKeyRequest,
  ValidateAIKeyResponse,
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
