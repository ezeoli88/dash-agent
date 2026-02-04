'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { taskKeys } from './query-keys'
import { tasksApi } from '@/lib/api-client'
import type { PRComment, PRCommentsResponse } from '../types'

interface UsePRCommentsOptions {
  taskId: string
  /** Only fetch if task has a PR URL */
  enabled?: boolean
}

export function usePRComments({ taskId, enabled = true }: UsePRCommentsOptions) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: taskKeys.prComments(taskId),
    queryFn: () => tasksApi.getPRComments(taskId),
    enabled,
    // Refetch every 60 seconds to stay in sync with polling service
    refetchInterval: 60_000,
    // Don't refetch on window focus since we have SSE for real-time updates
    refetchOnWindowFocus: false,
  })

  // Add a new comment to the cache (called from SSE handler)
  const addComment = useCallback((comment: PRComment) => {
    queryClient.setQueryData<PRCommentsResponse>(
      taskKeys.prComments(taskId),
      (oldData) => {
        if (!oldData) {
          return {
            comments: [comment],
            totalCount: 1,
          }
        }

        // Check if comment already exists (avoid duplicates)
        const exists = oldData.comments.some((c) => c.id === comment.id)
        if (exists) {
          return oldData
        }

        return {
          comments: [...oldData.comments, comment],
          totalCount: oldData.totalCount + 1,
        }
      }
    )
  }, [queryClient, taskId])

  // Invalidate and refetch comments
  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: taskKeys.prComments(taskId) })
  }, [queryClient, taskId])

  return {
    comments: query.data?.comments ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addComment,
    refetch,
  }
}
