/**
 * Board Types
 *
 * Types for the Kanban board view feature.
 */

import type { Task, TaskStatus } from '@/features/tasks/types'

/**
 * Column identifiers for the Kanban board
 */
export type BoardColumnId = 'ideas' | 'ready' | 'inProgress' | 'review' | 'done'

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
  ideas: Task[]
  ready: Task[]
  inProgress: Task[]
  review: Task[]
  done: Task[]
}

/**
 * Board column configuration map
 */
export const BOARD_COLUMNS: BoardColumnConfig[] = [
  {
    id: 'ideas',
    title: 'Ideas',
    statuses: ['draft', 'refining', 'backlog', 'planning'],
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800/50',
    borderColor: 'border-gray-300 dark:border-gray-700',
  },
  {
    id: 'ready',
    title: 'Ready',
    statuses: ['pending_approval', 'awaiting_review'],
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-300 dark:border-amber-700',
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
    id: 'review',
    title: 'Review',
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
]

/**
 * Map of status to column ID for quick lookups
 */
export const STATUS_TO_COLUMN: Record<TaskStatus, BoardColumnId> = {
  // Ideas column
  draft: 'ideas',
  refining: 'ideas',
  backlog: 'ideas',
  planning: 'ideas',
  // Ready column
  pending_approval: 'ready',
  awaiting_review: 'ready',
  // In Progress column
  approved: 'inProgress',
  coding: 'inProgress',
  in_progress: 'inProgress',
  // Review column
  review: 'review',
  changes_requested: 'review',
  pr_created: 'review',
  // Done column
  done: 'done',
  // Failed goes to ideas (can retry)
  failed: 'ideas',
}
