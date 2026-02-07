'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { repoKeys } from './query-keys'
import type { LocalReposResponse, Repository } from '../types'

/**
 * Hook to scan for local repositories
 */
export function useLocalRepos(enabled: boolean) {
  return useQuery({
    queryKey: repoKeys.localScan(),
    queryFn: () => apiClient.get<LocalReposResponse>('/repos/local/scan'),
    enabled,
  })
}

/**
 * Hook to add a local repository
 */
export function useAddLocalRepo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { name: string; path: string; default_branch: string; remote_url?: string | null }) =>
      apiClient.post<Repository>('/repos/local/add', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoKeys.all })
    },
  })
}
