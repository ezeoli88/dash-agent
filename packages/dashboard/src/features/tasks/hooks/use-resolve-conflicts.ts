'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '@/lib/api-client'
import { taskKeys } from './query-keys'
import { toast } from 'sonner'

interface ResolveConflictsResponse {
  status: string
  message: string
}

interface ConflictErrorResponse {
  error: string
  files: string[]
}

export function useResolveConflicts(taskId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (): Promise<ResolveConflictsResponse> =>
      apiClient.post<ResolveConflictsResponse>(`/tasks/${taskId}/resolve-conflicts`),
    onSuccess: () => {
      toast.success('Conflictos resueltos, creando PR...')
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
    onError: (error: Error) => {
      if (error instanceof ApiClientError && error.statusCode === 409) {
        toast.error(`Aun quedan conflictos sin resolver: ${error.message}`)
      } else {
        toast.error(`Error al verificar conflictos: ${error.message}`)
      }
    },
  })
}
