'use client'

import { useQuery } from '@tanstack/react-query'
import { repoKeys } from './query-keys'
import { apiClient } from '@/lib/api-client'
import { useSetupStore } from '@/features/setup/stores/setup-store'
import type { GitHubReposResponse } from '../types'

/**
 * Hook to fetch GitHub repositories for the authenticated user.
 *
 * Note: The GitHub token is now stored server-side. The backend will
 * use the stored token from the secrets service, so we don't need to
 * send it in headers anymore.
 */
export function useGitHubRepos(search?: string) {
  // Check if GitHub is connected (token is stored server-side)
  const githubConnected = useSetupStore((state) => state.githubConnected)

  return useQuery({
    queryKey: repoKeys.githubList(search),
    queryFn: async () => {
      const params: Record<string, string> = {
        per_page: '50',
      }

      if (search && search.trim().length > 0) {
        params.search = search.trim()
      }

      // No need to send token - backend gets it from secrets service
      return apiClient.get<GitHubReposResponse>('/repos/github/repos', {
        params,
      })
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    enabled: githubConnected,
  })
}
