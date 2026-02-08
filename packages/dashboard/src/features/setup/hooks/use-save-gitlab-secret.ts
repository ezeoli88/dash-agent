'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { SaveGitLabSecretRequest, SaveGitLabSecretResponse } from '@dash-agent/shared'
import { SECRETS_STATUS_KEY } from './use-secrets-status'

/**
 * Hook for saving a GitLab token to the server.
 */
export function useSaveGitLabSecret() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SaveGitLabSecretRequest) =>
      apiClient.post<SaveGitLabSecretResponse>('/secrets/gitlab', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SECRETS_STATUS_KEY })
    },
  })
}

/**
 * Hook for deleting the stored GitLab token.
 */
export function useDeleteGitLabSecret() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => apiClient.delete<{ success: boolean; message?: string }>('/secrets/gitlab'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SECRETS_STATUS_KEY })
    },
  })
}
