'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { AllSecretsStatus } from '@dash-agent/shared'

/**
 * Query key for secrets status
 */
export const SECRETS_STATUS_KEY = ['secrets', 'status'] as const

/**
 * Hook for fetching the status of all secrets (AI and GitHub connections).
 * This is the source of truth for connection status.
 */
export function useSecretsStatus() {
  return useQuery({
    queryKey: SECRETS_STATUS_KEY,
    queryFn: () => apiClient.get<AllSecretsStatus>('/secrets/status'),
    staleTime: 30_000, // Consider fresh for 30 seconds
    refetchOnWindowFocus: true,
  })
}

/**
 * Hook for invalidating secrets status
 */
export function useInvalidateSecretsStatus() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: SECRETS_STATUS_KEY })
  }
}

/**
 * Hook for checking if setup is complete
 */
export function useIsSetupComplete() {
  const { data, isLoading } = useSecretsStatus()

  return {
    isComplete: data?.isComplete ?? false,
    isLoading,
    aiConnected: data?.ai.connected ?? false,
    githubConnected: data?.github.connected ?? false,
  }
}
