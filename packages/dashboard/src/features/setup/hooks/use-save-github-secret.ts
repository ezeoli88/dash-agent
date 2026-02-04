'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { SaveGitHubSecretRequest, SaveGitHubSecretResponse } from '@dash-agent/shared'
import { SECRETS_STATUS_KEY } from './use-secrets-status'

/**
 * Hook for saving a GitHub token to the server.
 * Can be used for both OAuth tokens and Personal Access Tokens.
 */
export function useSaveGitHubSecret() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SaveGitHubSecretRequest) =>
      apiClient.post<SaveGitHubSecretResponse>('/secrets/github', data),
    onSuccess: () => {
      // Invalidate secrets status to refetch the new state
      queryClient.invalidateQueries({ queryKey: SECRETS_STATUS_KEY })
    },
  })
}

/**
 * Hook for deleting the stored GitHub token.
 */
export function useDeleteGitHubSecret() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => apiClient.delete<{ success: boolean; message?: string }>('/secrets/github'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SECRETS_STATUS_KEY })
    },
  })
}
