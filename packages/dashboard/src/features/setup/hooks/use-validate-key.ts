'use client'

import { useMutation } from '@tanstack/react-query'
import { useSetupStore } from '../stores/setup-store'
import { apiClient } from '@/lib/api-client'
import type { AIProvider, ValidateAIKeyResponse } from '../types'

interface ValidateKeyParams {
  provider: AIProvider
  apiKey: string
}

/**
 * Hook for validating AI provider API keys.
 *
 * Note: This hook only validates the key. To save the key to the server,
 * use useSaveAISecret instead. This hook is kept for backward compatibility
 * but the preferred flow is to use useSaveAISecret which validates AND saves.
 *
 * @deprecated Use useSaveAISecret instead which validates and saves in one operation
 */
export function useValidateKey() {
  const setAIConnected = useSetupStore((state) => state.setAIConnected)
  const setValidationState = useSetupStore((state) => state.setValidationState)

  const mutation = useMutation({
    mutationFn: async ({ provider, apiKey }: ValidateKeyParams) => {
      setValidationState('validating')

      const response = await apiClient.post<ValidateAIKeyResponse>(
        '/setup/validate-ai-key',
        { provider, apiKey }
      )

      return { response, provider }
    },
    onSuccess: ({ response, provider }) => {
      if (response.valid) {
        // Note: This only updates local state, NOT server-side storage
        // Use useSaveAISecret for proper server-side key storage
        setAIConnected(provider)
        setValidationState('valid')
      } else {
        setValidationState('invalid', response.error || 'Invalid API key')
      }
    },
    onError: (error) => {
      setValidationState('invalid', error instanceof Error ? error.message : 'Validation failed')
    },
  })

  return {
    validateKey: mutation.mutate,
    validateKeyAsync: mutation.mutateAsync,
    isValidating: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  }
}
