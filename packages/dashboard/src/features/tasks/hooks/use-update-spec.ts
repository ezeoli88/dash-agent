'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { taskKeys } from './query-keys'
import type { Task } from '../types'

interface UpdateSpecInput {
  taskId: string
  spec: string
}

/**
 * Hook to update the spec (user editing).
 * Only valid for tasks with status 'pending_approval'.
 */
export function useUpdateSpec() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, spec }: UpdateSpecInput): Promise<Task> => {
      const response = await apiClient.patch<Task>(
        `/tasks/${taskId}/spec`,
        { spec }
      )
      return response
    },
    onMutate: async ({ taskId, spec }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) })

      const previousTask = queryClient.getQueryData<Task>(taskKeys.detail(taskId))

      if (previousTask) {
        queryClient.setQueryData<Task>(taskKeys.detail(taskId), {
          ...previousTask,
          generated_spec: spec,
          final_spec: spec,
          was_spec_edited: true,
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
    },
  })
}
