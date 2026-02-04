'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { repoKeys } from './query-keys'
import { apiClient } from '@/lib/api-client'
import type {
  Repository,
  AddPatternResponse,
  DeletePatternResponse,
} from '../types'

interface AddPatternInput {
  repoId: string
  pattern: string
  taskId: string
}

interface DeletePatternInput {
  repoId: string
  patternId: string
}

/**
 * Hook to add a learned pattern to a repository
 */
export function useAddPattern() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ repoId, pattern, taskId }: AddPatternInput) => {
      return apiClient.post<Repository>(`/repos/${repoId}/patterns`, {
        pattern,
        taskId,
      })
    },
    onSuccess: (_, variables) => {
      // Invalidate both list and detail queries
      queryClient.invalidateQueries({ queryKey: repoKeys.lists() })
      queryClient.invalidateQueries({ queryKey: repoKeys.detail(variables.repoId) })
    },
  })
}

/**
 * Hook to delete a specific learned pattern from a repository
 */
export function useDeletePattern() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ repoId, patternId }: DeletePatternInput) => {
      return apiClient.delete<DeletePatternResponse>(
        `/repos/${repoId}/patterns/${patternId}`
      )
    },
    onSuccess: (_, variables) => {
      // Invalidate both list and detail queries
      queryClient.invalidateQueries({ queryKey: repoKeys.lists() })
      queryClient.invalidateQueries({ queryKey: repoKeys.detail(variables.repoId) })
    },
  })
}
