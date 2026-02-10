'use client'

import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'

interface OpenEditorResponse {
  opened: boolean
  path: string
}

export function useOpenEditor(taskId: string) {
  return useMutation({
    mutationFn: (): Promise<OpenEditorResponse> =>
      apiClient.post<OpenEditorResponse>(`/tasks/${taskId}/open-editor`),
    onSuccess: () => {
      toast.success('VS Code abierto en el worktree')
    },
    onError: (error: Error) => {
      toast.error(`Error al abrir VS Code: ${error.message}`)
    },
  })
}
