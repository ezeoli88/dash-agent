'use client'

import { useTasks, type TaskFilters } from '@/features/tasks/hooks/use-tasks'
import type { TaskStatus } from '@/features/tasks/types'

const SPEC_STATUSES: TaskStatus[] = ['draft', 'refining', 'pending_approval']

export interface SpecFilters {
  search?: string
  repository_id?: string
  statusFilter?: TaskStatus[]
}

export function useSpecs(filters: SpecFilters = {}) {
  const taskFilters: TaskFilters = {
    status: filters.statusFilter?.length ? filters.statusFilter : SPEC_STATUSES,
    search: filters.search,
    repository_id: filters.repository_id,
  }

  return useTasks(taskFilters)
}
