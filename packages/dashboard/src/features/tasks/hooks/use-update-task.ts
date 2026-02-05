'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { taskKeys } from './query-keys'
import { tasksApi } from '@/lib/api-client'
import type { UpdateTaskInput, Task } from '../types'

export function useUpdateTask(taskId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateTaskInput): Promise<Task> => tasksApi.update(taskId, data),
    onSuccess: (updatedTask) => {
      // Update the task in cache
      queryClient.setQueryData<Task>(taskKeys.detail(taskId), updatedTask)
      // Invalidate all task lists to ensure fresh data
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}
