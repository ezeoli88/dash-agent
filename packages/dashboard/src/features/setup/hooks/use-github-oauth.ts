'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSetupStore } from '../stores/setup-store'
import { apiClient } from '@/lib/api-client'
import { SECRETS_STATUS_KEY } from './use-secrets-status'
import type { GitHubAuthUrlResponse, GitHubCallbackResponse } from '../types'

/**
 * Hook for getting GitHub OAuth URL
 */
export function useGitHubAuthUrl() {
  return useQuery({
    queryKey: ['setup', 'github', 'auth-url'],
    queryFn: async () => {
      return apiClient.get<GitHubAuthUrlResponse & { configured: boolean }>(
        '/setup/github/auth'
      )
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: false, // Only fetch when explicitly called
  })
}

/**
 * Hook for handling GitHub OAuth callback.
 *
 * Note: The token is now stored server-side and NOT returned to the frontend.
 * The callback only returns user info (username, avatar).
 */
export function useGitHubCallback() {
  const setGitHubConnected = useSetupStore((state) => state.setGitHubConnected)
  const setGitHubConnectionState = useSetupStore((state) => state.setGitHubConnectionState)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ code, state }: { code: string; state: string }) => {
      setGitHubConnectionState('connecting')

      // Note: Response no longer includes token - it's stored server-side
      return apiClient.post<GitHubCallbackResponse>(
        '/setup/github/callback',
        { code, state }
      )
    },
    onSuccess: (response) => {
      if (response.success && response.username) {
        // Token is stored server-side via OAuth flow
        // We only update local state with user info
        setGitHubConnected(response.username, response.avatarUrl ?? null, 'oauth')

        // Invalidate secrets status to refetch from server
        queryClient.invalidateQueries({ queryKey: SECRETS_STATUS_KEY })
      } else {
        setGitHubConnectionState('error', response.error || 'GitHub connection failed')
      }
    },
    onError: (error) => {
      setGitHubConnectionState('error', error instanceof Error ? error.message : 'Connection failed')
    },
  })

  return {
    handleCallback: mutation.mutate,
    handleCallbackAsync: mutation.mutateAsync,
    isConnecting: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  }
}

/**
 * Hook for initiating GitHub OAuth flow
 */
export function useGitHubConnect() {
  const setGitHubConnectionState = useSetupStore((state) => state.setGitHubConnectionState)

  const mutation = useMutation({
    mutationFn: async () => {
      setGitHubConnectionState('connecting')

      const response = await apiClient.get<GitHubAuthUrlResponse & { configured: boolean }>(
        '/setup/github/auth'
      )

      return response
    },
    onSuccess: (response) => {
      // Store state in sessionStorage for callback validation
      sessionStorage.setItem('github-oauth-state', response.state)

      // Redirect to GitHub OAuth
      window.location.href = response.authUrl
    },
    onError: (error) => {
      setGitHubConnectionState('error', error instanceof Error ? error.message : 'Failed to start OAuth')
    },
  })

  return {
    connect: mutation.mutate,
    isConnecting: mutation.isPending,
    error: mutation.error,
  }
}
