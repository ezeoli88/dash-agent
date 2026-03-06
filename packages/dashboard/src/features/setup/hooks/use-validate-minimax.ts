'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSetupStore } from '../stores/setup-store'
import { apiClient } from '@/lib/api-client'
import type { SaveAISecretResponse } from '@dash-agent/shared'

interface ValidateMiniMaxParams {
  apiKey: string
}

interface ValidateMiniMaxKeyResponse {
  valid: boolean
  error?: string
}

/**
 * Hook for validating MiniMax API keys and connecting.
 *
 * Validates the key via the server, then saves it encrypted server-side.
 */
export function useValidateMiniMax() {
  const queryClient = useQueryClient()
  const setValidationState = useSetupStore((state) => state.setValidationState)
  const setAIConnected = useSetupStore((state) => state.setAIConnected)

  const validateMutation = useMutation({
    mutationFn: async ({ apiKey }: ValidateMiniMaxParams) => {
      setValidationState('validating')

      const response = await apiClient.post<ValidateMiniMaxKeyResponse>(
        '/setup/validate-minimax-key',
        { apiKey }
      )

      return { response, apiKey }
    },
    onSuccess: ({ response }) => {
      if (response.valid) {
        setValidationState('valid')
      } else {
        setValidationState('invalid', response.error || 'Invalid API key')
      }
    },
    onError: (error) => {
      setValidationState('invalid', error instanceof Error ? error.message : 'Validation failed')
    },
  })

  const connectMutation = useMutation({
    mutationFn: async ({ apiKey }: ValidateMiniMaxParams) => {
      const response = await apiClient.post<SaveAISecretResponse>(
        '/secrets/ai',
        {
          provider: 'minimax',
          apiKey,
        }
      )

      if (!response.success) {
        throw new Error(response.error || 'Failed to save API key')
      }

      return { response }
    },
    onSuccess: () => {
      setAIConnected('minimax', { name: 'MiniMax', description: '' })
      setValidationState('valid')
      queryClient.invalidateQueries({ queryKey: ['detected-agents'] })
    },
    onError: (error) => {
      setValidationState('invalid', error instanceof Error ? error.message : 'Connection failed')
    },
  })

  return {
    validateKey: validateMutation.mutate,
    validateKeyAsync: validateMutation.mutateAsync,
    isValidating: validateMutation.isPending,
    validationError: validateMutation.error,

    connect: connectMutation.mutate,
    connectAsync: connectMutation.mutateAsync,
    isConnecting: connectMutation.isPending,
    connectError: connectMutation.error,

    reset: () => {
      validateMutation.reset()
      connectMutation.reset()
      setValidationState('idle')
    },
  }
}
