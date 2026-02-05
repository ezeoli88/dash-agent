'use client'

import { useQuery } from '@tanstack/react-query'
import { taskKeys } from './query-keys'
import { tasksApi } from '@/lib/api-client'

/**
 * Statuses that indicate async processing is happening and we should poll for updates.
 * - 'refining': PM Agent is generating the spec (async, takes 10-30 seconds)
 * - 'approved': Dev Agent is starting (transitional, should move to 'coding' quickly)
 */
const POLLING_STATUSES = ['refining', 'approved'] as const

/**
 * Hook to fetch a single task by ID.
 *
 * Features:
 * - Automatic polling when task is in async processing states (refining, approved)
 * - Exponential backoff on retry
 * - 30 second stale time for normal states
 */
export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => tasksApi.getById(id),
    enabled: !!id,
    staleTime: 30_000, // 30 seconds
    retry: 2, // Retry failed requests up to 2 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000), // Exponential backoff
    // Poll every 2 seconds when task is in async processing states
    refetchInterval: (query) => {
      const task = query.state.data
      if (task && POLLING_STATUSES.includes(task.status as typeof POLLING_STATUSES[number])) {
        return 2000 // Poll every 2 seconds
      }
      return false // No polling for other states
    },
  })
}
