'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { taskKeys } from './query-keys'
import type { Task } from '../types'

interface ApproveSpecInput {
  taskId: string
  finalSpec?: string
}

interface ApproveSpecResponse {
  status: 'approved'
  task_status: string
  message: string
}

/**
 * Hook to approve the spec and start the Dev Agent.
 * Only valid for tasks with status 'pending_approval'.
 */
export function useApproveSpec() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, finalSpec }: ApproveSpecInput): Promise<ApproveSpecResponse> => {
      const response = await apiClient.post<ApproveSpecResponse>(
        `/tasks/${taskId}/approve-spec`,
        finalSpec ? { final_spec: finalSpec } : {}
      )
      return response
    },
    onMutate: async ({ taskId }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) })

      const previousTask = queryClient.getQueryData<Task>(taskKeys.detail(taskId))

      if (previousTask) {
        queryClient.setQueryData<Task>(taskKeys.detail(taskId), {
          ...previousTask,
          status: 'approved',
        })
      }

      return { previousTask }
    },
    onError: (_error, { taskId }, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(taskKeys.detail(taskId), context.previousTask)
      }
    },
    onSettled: (_data, _error, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}
