export { useSetupStatus } from './use-setup-status'
export { useValidateKey } from './use-validate-key'
export { useValidateOpenRouter } from './use-validate-openrouter'

// New secrets API hooks
export { useSecretsStatus, useInvalidateSecretsStatus, useIsSetupComplete, SECRETS_STATUS_KEY } from './use-secrets-status'
export { useSaveAISecret, useDeleteAISecret } from './use-save-ai-secret'
export { useSaveGitHubSecret, useDeleteGitHubSecret } from './use-save-github-secret'
export { useValidateGitHubPAT } from './use-validate-github-pat'
export { useSaveGitLabSecret, useDeleteGitLabSecret } from './use-save-gitlab-secret'
export { useValidateGitLabPAT } from './use-validate-gitlab-pat'

// Agent detection and settings hooks
export { useDetectedAgents } from './use-detected-agents'
export { useSettings, useUpdateSettings } from './use-settings'
