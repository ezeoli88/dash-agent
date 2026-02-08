'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { taskKeys } from './query-keys'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'

export function useStartTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (taskId: string) => {
      return apiClient.post<{ status: string; message: string }>(`/tasks/${taskId}/start`)
    },
    onSuccess: (_, taskId) => {
      toast.success('Task started')
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
    onError: (error: Error) => {
      toast.error(`Failed to start task: ${error.message}`)
    },
  })
}
