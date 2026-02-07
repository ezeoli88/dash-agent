'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { taskKeys } from './query-keys'
import { useSetupStore } from '@/features/setup/stores/setup-store'
import type { Task } from '../types'

interface GenerateSpecInput {
  taskId: string
  additionalContext?: string
}

interface GenerateSpecResponse {
  status: 'generating'
  message: string
}

/**
 * Hook to trigger spec generation by the PM Agent.
 *
 * Note: AI credentials are now stored server-side. The backend will
 * use the stored API key from the secrets service.
 */
export function useGenerateSpec() {
  const queryClient = useQueryClient()
  const aiConnected = useSetupStore((state) => state.aiConnected)
  const agentConnected = useSetupStore((state) => state.agentConnected)

  return useMutation({
    mutationFn: async ({ taskId, additionalContext }: GenerateSpecInput): Promise<GenerateSpecResponse> => {
      if (!aiConnected && !agentConnected) {
        throw new Error('AI provider not configured. Please complete setup first.')
      }

      const response = await apiClient.post<GenerateSpecResponse>(
        `/tasks/${taskId}/generate-spec`,
        { additional_context: additionalContext }
      )

      return response
    },
    onMutate: async ({ taskId }) => {
      // Optimistically update task status to 'refining'
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) })

      const previousTask = queryClient.getQueryData<Task>(taskKeys.detail(taskId))

      if (previousTask) {
        queryClient.setQueryData<Task>(taskKeys.detail(taskId), {
          ...previousTask,
          status: 'refining',
        })
      }

      return { previousTask }
    },
    onError: (_error, { taskId }, context) => {
      // Rollback on error
      if (context?.previousTask) {
        queryClient.setQueryData(taskKeys.detail(taskId), context.previousTask)
      }
    },
    onSettled: (_data, _error, { taskId }) => {
      // Invalidate to get fresh data
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

/**
 * Hook to regenerate spec (when user wants a different approach).
 */
export function useRegenerateSpec() {
  const queryClient = useQueryClient()
  const aiConnected = useSetupStore((state) => state.aiConnected)
  const agentConnected = useSetupStore((state) => state.agentConnected)

  return useMutation({
    mutationFn: async ({ taskId, additionalContext }: GenerateSpecInput): Promise<GenerateSpecResponse> => {
      if (!aiConnected && !agentConnected) {
        throw new Error('AI provider not configured. Please complete setup first.')
      }

      const response = await apiClient.post<GenerateSpecResponse>(
        `/tasks/${taskId}/regenerate-spec`,
        { additional_context: additionalContext }
      )

      return response
    },
    onMutate: async ({ taskId }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) })

      const previousTask = queryClient.getQueryData<Task>(taskKeys.detail(taskId))

      if (previousTask) {
        queryClient.setQueryData<Task>(taskKeys.detail(taskId), {
          ...previousTask,
          status: 'refining',
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
