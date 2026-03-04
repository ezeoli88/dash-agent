'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { taskKeys } from '@/features/tasks/hooks/query-keys'
import { tasksApi } from '@/lib/api-client'
import { toast } from 'sonner'

interface ApproveSpecParams {
  taskId: string
  finalSpec: string
  wasEdited: boolean
}

export function useApproveSpec() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, finalSpec, wasEdited }: ApproveSpecParams) => {
      return tasksApi.update(taskId, {
        final_spec: finalSpec,
        spec_approved_at: new Date().toISOString(),
        was_spec_edited: wasEdited,
        status: 'approved',
      })
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      toast.success('Spec approved! Task moved to Board.')
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve spec: ${error.message}`)
    },
  })
}
