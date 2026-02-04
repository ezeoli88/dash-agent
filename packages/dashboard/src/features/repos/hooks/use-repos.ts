'use client'

import { useQuery } from '@tanstack/react-query'
import { repoKeys } from './query-keys'
import { apiClient } from '@/lib/api-client'
import type { Repository } from '../types'

/**
 * Hook to fetch all repositories.
 *
 * Note: GitHub token is now stored server-side. The backend will use
 * the stored token from the secrets service.
 */
export function useRepos() {
  return useQuery({
    queryKey: repoKeys.list(),
    queryFn: async () => {
      // No need to send token - backend gets it from secrets service
      return apiClient.get<Repository[]>('/repos')
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
