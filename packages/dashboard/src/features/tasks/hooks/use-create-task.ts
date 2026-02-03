'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { taskKeys } from './query-keys'
import { tasksApi } from '@/lib/api-client'
import type { CreateTaskInput, Task } from '../types'

export function useCreateTask() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: (data: CreateTaskInput): Promise<Task> => tasksApi.create(data),
    onSuccess: (newTask) => {
      // Invalidate all task lists to ensure fresh data
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })

      // Navigate to the new task detail page
      router.push(`/tasks/${newTask.id}`)
    },
  })
}
