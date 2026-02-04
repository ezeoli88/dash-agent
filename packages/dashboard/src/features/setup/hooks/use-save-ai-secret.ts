'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { SaveAISecretRequest, SaveAISecretResponse } from '@dash-agent/shared'
import { SECRETS_STATUS_KEY } from './use-secrets-status'

/**
 * Hook for saving an AI API key to the server.
 * The key is validated before saving and stored encrypted.
 */
export function useSaveAISecret() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SaveAISecretRequest) =>
      apiClient.post<SaveAISecretResponse>('/secrets/ai', data),
    onSuccess: () => {
      // Invalidate secrets status to refetch the new state
      queryClient.invalidateQueries({ queryKey: SECRETS_STATUS_KEY })
    },
  })
}

/**
 * Hook for deleting the stored AI API key.
 */
export function useDeleteAISecret() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => apiClient.delete<{ success: boolean; message?: string }>('/secrets/ai'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SECRETS_STATUS_KEY })
    },
  })
}
