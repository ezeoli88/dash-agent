'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSetupStore } from '../stores/setup-store'
import { apiClient } from '@/lib/api-client'
import type { ValidateOpenRouterKeyResponse } from '../types'
import type { SaveAISecretResponse } from '@dash-agent/shared'

interface ValidateOpenRouterParams {
  apiKey: string
}

interface ValidateAndConnectParams {
  apiKey: string
  model: string
}

/**
 * Hook for validating OpenRouter API keys and fetching available models.
 *
 * This hook now integrates with server-side secret storage.
 * When connecting, it saves the API key encrypted on the server.
 */
export function useValidateOpenRouter() {
  const queryClient = useQueryClient()
  const setValidationState = useSetupStore((state) => state.setValidationState)
  const setAvailableModels = useSetupStore((state) => state.setAvailableModels)
  const setAIConnected = useSetupStore((state) => state.setAIConnected)

  // Mutation to validate key and get models
  const validateMutation = useMutation({
    mutationFn: async ({ apiKey }: ValidateOpenRouterParams) => {
      setValidationState('validating')

      const response = await apiClient.post<ValidateOpenRouterKeyResponse>(
        '/setup/validate-openrouter-key',
        { apiKey }
      )

      return { response, apiKey }
    },
    onSuccess: ({ response }) => {
      if (response.valid && response.freeModels) {
        setAvailableModels(response.freeModels)
        setValidationState('valid')
      } else {
        setValidationState('invalid', response.error || 'Invalid API key')
      }
    },
    onError: (error) => {
      setValidationState('invalid', error instanceof Error ? error.message : 'Validation failed')
    },
  })

  // Mutation to connect with selected model - now saves to server
  const connectMutation = useMutation({
    mutationFn: async ({ apiKey, model }: ValidateAndConnectParams) => {
      // Save the API key to the server
      const response = await apiClient.post<SaveAISecretResponse>(
        '/secrets/ai',
        {
          provider: 'openrouter',
          apiKey,
          model,
        }
      )

      if (!response.success) {
        throw new Error(response.error || 'Failed to save API key')
      }

      return { response, model }
    },
    onSuccess: ({ response, model }) => {
      // Find the selected model info from available models
      const availableModels = useSetupStore.getState().availableModels
      const selectedModelInfo = availableModels.find(m => m.id === model)

      // Update local store with connection status
      setAIConnected(
        'openrouter',
        selectedModelInfo ? { name: selectedModelInfo.name, description: '' } : undefined,
        model
      )
      setValidationState('valid')

      // Invalidate detected-agents so model selectors refresh with new OpenRouter models
      queryClient.invalidateQueries({ queryKey: ['detected-agents'] })
    },
    onError: (error) => {
      setValidationState('invalid', error instanceof Error ? error.message : 'Connection failed')
    },
  })

  return {
    // Validate key only (to get models list)
    validateKey: validateMutation.mutate,
    validateKeyAsync: validateMutation.mutateAsync,
    isValidating: validateMutation.isPending,
    validationError: validateMutation.error,
    validationData: validateMutation.data,

    // Connect with selected model
    connect: connectMutation.mutate,
    connectAsync: connectMutation.mutateAsync,
    isConnecting: connectMutation.isPending,
    connectError: connectMutation.error,

    // Reset both mutations
    reset: () => {
      validateMutation.reset()
      connectMutation.reset()
      setValidationState('idle')
      setAvailableModels([])
    },
  }
}
