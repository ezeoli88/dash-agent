'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { repoKeys } from './query-keys'
import { apiClient } from '@/lib/api-client'
import { useSetupStore } from '@/features/setup/stores/setup-store'
import type {
  Repository,
  CreateRepositoryInput,
  UpdateRepositoryInput,
  ClearPatternsResponse,
} from '../types'

/**
 * Hook to create a new repository.
 *
 * Note: GitHub token is now stored server-side. The backend will use
 * the stored token from the secrets service.
 */
export function useCreateRepo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateRepositoryInput) => {
      // No need to send token - backend gets it from secrets service
      return apiClient.post<Repository>('/repos', input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoKeys.lists() })
    },
  })
}

/**
 * Hook to update a repository
 */
export function useUpdateRepo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateRepositoryInput }) => {
      return apiClient.patch<Repository>(`/repos/${id}`, data)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: repoKeys.lists() })
      queryClient.invalidateQueries({ queryKey: repoKeys.detail(variables.id) })
    },
  })
}

/**
 * Hook to delete a repository
 */
export function useDeleteRepo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      return apiClient.delete<void>(`/repos/${id}`)
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: repoKeys.lists() })
      queryClient.removeQueries({ queryKey: repoKeys.detail(id) })
    },
  })
}

/**
 * Hook to re-detect stack for a repository
 */
export function useDetectStack() {
  const queryClient = useQueryClient()
  const githubConnected = useSetupStore((state) => state.githubConnected)

  return useMutation({
    mutationFn: async (id: string) => {
      if (!githubConnected) {
        throw new Error('GitHub connection is required for stack detection')
      }
      // Backend gets token from secrets service
      return apiClient.post<Repository>(`/repos/${id}/detect-stack`)
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: repoKeys.lists() })
      queryClient.invalidateQueries({ queryKey: repoKeys.detail(id) })
    },
  })
}

/**
 * Hook to clear learned patterns from a repository
 */
export function useClearPatterns() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      return apiClient.delete<ClearPatternsResponse>(`/repos/${id}/patterns`)
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: repoKeys.lists() })
      queryClient.invalidateQueries({ queryKey: repoKeys.detail(id) })
    },
  })
}

/**
 * Hook to validate a repository URL
 */
export function useValidateRepoUrl() {
  const githubConnected = useSetupStore((state) => state.githubConnected)

  return useMutation({
    mutationFn: async (url: string) => {
      if (!githubConnected) {
        throw new Error('GitHub connection is required')
      }
      // Backend gets token from secrets service
      return apiClient.post<{ valid: boolean; error?: string; repo?: { full_name: string; default_branch: string } }>(
        '/repos/github/repos/validate',
        { url }
      )
    },
  })
}
