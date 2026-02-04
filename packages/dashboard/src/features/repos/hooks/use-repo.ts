'use client'

import { useQuery } from '@tanstack/react-query'
import { repoKeys } from './query-keys'
import { apiClient } from '@/lib/api-client'
import type { Repository } from '../types'

/**
 * Hook to fetch a single repository by ID.
 *
 * Note: GitHub token is now stored server-side. The backend will use
 * the stored token from the secrets service.
 */
export function useRepo(id: string | null) {
  return useQuery({
    queryKey: repoKeys.detail(id ?? ''),
    queryFn: async () => {
      if (!id) return null
      // No need to send token - backend gets it from secrets service
      return apiClient.get<Repository>(`/repos/${id}`)
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
