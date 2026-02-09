'use client'

import { useQuery } from '@tanstack/react-query'
import { taskKeys } from './query-keys'
import { tasksApi } from '@/lib/api-client'

/**
 * Hook to fetch task changes (file diffs)
 */
export function useTaskChanges(taskId: string, enabled = true) {
  return useQuery({
    queryKey: taskKeys.changes(taskId),
    queryFn: () => tasksApi.getChanges(taskId),
    enabled: enabled && Boolean(taskId),
    staleTime: 0, // Always refetch - diffs change frequently while agent works
  })
}
