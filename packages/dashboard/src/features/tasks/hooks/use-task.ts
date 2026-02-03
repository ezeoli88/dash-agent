'use client'

import { useQuery } from '@tanstack/react-query'
import { taskKeys } from './query-keys'
import { tasksApi } from '@/lib/api-client'

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => tasksApi.getById(id),
    enabled: !!id,
    staleTime: 30_000, // 30 seconds
    retry: 2, // Retry failed requests up to 2 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000), // Exponential backoff
  })
}
