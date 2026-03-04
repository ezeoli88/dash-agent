'use client'

import { useMemo } from 'react'
import { useTasks } from '@/features/tasks/hooks/use-tasks'
import type { Task, TaskStatus } from '@/features/tasks/types'
import { BOARD_COLUMNS, STATUS_TO_COLUMN, type BoardState, type BoardColumnId } from '../types'

/** Statuses handled by Spec Studio, excluded from Board */
const SPEC_PHASE_STATUSES: TaskStatus[] = ['draft', 'refining', 'pending_approval']

export interface UseBoardTasksOptions {
  repositoryId?: string
}

export interface UseBoardTasksResult {
  columns: BoardState
  isLoading: boolean
  isError: boolean
  error: Error | null
  totalTasks: number
  getColumnCount: (columnId: BoardColumnId) => number
}

/**
 * Hook that groups tasks by board column based on their status.
 * Supports optional filtering by repository.
 */
export function useBoardTasks(options: UseBoardTasksOptions = {}): UseBoardTasksResult {
  const { repositoryId } = options

  const { data: tasks, isLoading, isError, error } = useTasks(
    repositoryId ? { repository_id: repositoryId } : {}
  )

  const columns = useMemo<BoardState>(() => {
    // Initialize empty columns
    const result: BoardState = {
      todo: [],
      inProgress: [],
      inReview: [],
      done: [],
      failed: [],
      canceled: [],
    }

    if (!tasks) return result

    // Filter out spec-phase tasks (handled by Spec Studio) and optionally by repository
    const filteredTasks = tasks.filter((task) => {
      if (SPEC_PHASE_STATUSES.includes(task.status)) return false
      if (repositoryId && task.repository_id !== repositoryId) return false
      return true
    })

    // Group tasks by column
    filteredTasks.forEach((task) => {
      const columnId = STATUS_TO_COLUMN[task.status]
      if (columnId && result[columnId]) {
        result[columnId].push(task)
      }
    })

    // Sort tasks within each column by updated_at (most recent first)
    Object.keys(result).forEach((key) => {
      const columnKey = key as BoardColumnId
      result[columnKey].sort((a, b) => {
        const dateA = new Date(a.updated_at).getTime()
        const dateB = new Date(b.updated_at).getTime()
        return dateB - dateA
      })
    })

    return result
  }, [tasks, repositoryId])

  const totalTasks = useMemo(() => {
    return (
      columns.todo.length +
      columns.inProgress.length +
      columns.inReview.length +
      columns.done.length +
      columns.failed.length +
      columns.canceled.length
    )
  }, [columns])

  const getColumnCount = (columnId: BoardColumnId): number => {
    return columns[columnId]?.length ?? 0
  }

  return {
    columns,
    isLoading,
    isError,
    error: error as Error | null,
    totalTasks,
    getColumnCount,
  }
}

/**
 * Get the column configuration by ID
 */
export function getColumnConfig(columnId: BoardColumnId) {
  return BOARD_COLUMNS.find((col) => col.id === columnId)
}
