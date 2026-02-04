export { useSetupStatus, useCurrentSetupStep } from './use-setup-status'
export { useValidateKey } from './use-validate-key'
export { useValidateOpenRouter } from './use-validate-openrouter'
export { useGitHubAuthUrl, useGitHubCallback, useGitHubConnect } from './use-github-oauth'

// New secrets API hooks
export { useSecretsStatus, useInvalidateSecretsStatus, useIsSetupComplete, SECRETS_STATUS_KEY } from './use-secrets-status'
export { useSaveAISecret, useDeleteAISecret } from './use-save-ai-secret'
export { useSaveGitHubSecret, useDeleteGitHubSecret } from './use-save-github-secret'
export { useValidateGitHubPAT } from './use-validate-github-pat'
