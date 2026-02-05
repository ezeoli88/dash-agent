/**
 * Board Types
 *
 * Types for the Kanban board view feature.
 */

import type { Task, TaskStatus } from '@/features/tasks/types'

/**
 * Column identifiers for the Kanban board
 */
export type BoardColumnId = 'todo' | 'inProgress' | 'inReview' | 'done' | 'cancelled'

/**
 * Configuration for a board column
 */
export interface BoardColumnConfig {
  id: BoardColumnId
  title: string
  statuses: TaskStatus[]
  color: string
  bgColor: string
  borderColor: string
}

/**
 * Column with tasks
 */
export interface BoardColumn extends BoardColumnConfig {
  tasks: Task[]
}

/**
 * Board state with all columns
 */
export interface BoardState {
  todo: Task[]
  inProgress: Task[]
  inReview: Task[]
  done: Task[]
  cancelled: Task[]
}

/**
 * Board column configuration map
 */
export const BOARD_COLUMNS: BoardColumnConfig[] = [
  {
    id: 'todo',
    title: 'To Do',
    statuses: ['draft', 'refining', 'backlog', 'planning', 'pending_approval', 'awaiting_review'],
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800/50',
    borderColor: 'border-gray-300 dark:border-gray-700',
  },
  {
    id: 'inProgress',
    title: 'In Progress',
    statuses: ['approved', 'coding', 'in_progress'],
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-300 dark:border-blue-700',
  },
  {
    id: 'inReview',
    title: 'In Review',
    statuses: ['review', 'changes_requested', 'pr_created'],
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-300 dark:border-purple-700',
  },
  {
    id: 'done',
    title: 'Done',
    statuses: ['done'],
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-300 dark:border-green-700',
  },
  {
    id: 'cancelled',
    title: 'Cancelled',
    statuses: ['failed'],
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-300 dark:border-red-700',
  },
]

/**
 * Map of status to column ID for quick lookups
 */
export const STATUS_TO_COLUMN: Record<TaskStatus, BoardColumnId> = {
  // To Do column
  draft: 'todo',
  refining: 'todo',
  backlog: 'todo',
  planning: 'todo',
  pending_approval: 'todo',
  awaiting_review: 'todo',
  // In Progress column
  approved: 'inProgress',
  coding: 'inProgress',
  in_progress: 'inProgress',
  // In Review column
  review: 'inReview',
  changes_requested: 'inReview',
  pr_created: 'inReview',
  // Done column
  done: 'done',
  // Cancelled column
  failed: 'cancelled',
}
