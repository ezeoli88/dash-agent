'use client'

import { useQuery } from '@tanstack/react-query'
import { taskKeys } from './query-keys'
import { tasksApi } from '@/lib/api-client'
import type { TaskStatus } from '../types'

export interface TaskFilters {
  status?: TaskStatus[]
  search?: string
}

export function useTasks(filters: TaskFilters = {}) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => tasksApi.getAll(filters),
    staleTime: 30_000, // 30 seconds
  })
}
