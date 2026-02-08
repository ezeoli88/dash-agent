'use client'

import { useQuery } from '@tanstack/react-query'
import { taskKeys } from './query-keys'
import { tasksApi } from '@/lib/api-client'
import type { TaskStatus } from '../types'

export interface TaskFilters {
  status?: TaskStatus[]
  search?: string
}

const ACTIVE_STATUSES = ['refining', 'approved', 'planning', 'in_progress', 'coding'] as const

export function useTasks(filters: TaskFilters = {}) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => tasksApi.getAll(filters),
    staleTime: 30_000, // 30 seconds
    refetchInterval: (query) => {
      const tasks = query.state.data
      if (tasks?.some(t => ACTIVE_STATUSES.includes(t.status as typeof ACTIVE_STATUSES[number]))) {
        return 3000
      }
      return false
    },
  })
}
