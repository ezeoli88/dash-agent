import type { TaskStatus } from '../schemas/task.schema.js';

/**
 * Labels for task statuses (for UI display)
 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  planning: 'Planning',
  in_progress: 'In Progress',
  awaiting_review: 'Awaiting Review',
  approved: 'Approved',
  pr_created: 'PR Created',
  changes_requested: 'Changes Requested',
  done: 'Done',
  failed: 'Failed',
};

/**
 * Colors/CSS classes for task statuses (Tailwind classes)
 */
export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
  planning: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  in_progress:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  awaiting_review:
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  pr_created:
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100',
  changes_requested:
    'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
};

/**
 * Determines which actions are available for a given task status.
 */
export function getAvailableActionsForStatus(
  status: TaskStatus
): readonly string[] {
  switch (status) {
    case 'backlog':
      return ['execute'] as const;
    case 'planning':
      return ['cancel'] as const;
    case 'in_progress':
      return ['extend', 'cancel', 'feedback'] as const;
    case 'awaiting_review':
      return ['approve', 'cancel'] as const;
    case 'approved':
      return [] as const; // Processing...
    case 'pr_created':
      return ['request_changes', 'mark_merged', 'mark_closed'] as const;
    case 'changes_requested':
      return ['execute', 'mark_closed'] as const; // Resume or close
    case 'done':
      return ['view_pr'] as const;
    case 'failed':
      return ['execute'] as const; // Retry
    default:
      return [] as const;
  }
}

/**
 * Checks if a task is in a terminal state (cannot progress further).
 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'done' || status === 'failed';
}

/**
 * Checks if a task is actively being worked on.
 */
export function isActiveStatus(status: TaskStatus): boolean {
  return (
    status === 'planning' ||
    status === 'in_progress' ||
    status === 'approved'
  );
}

/**
 * Checks if a task requires user attention/action.
 */
export function requiresUserAction(status: TaskStatus): boolean {
  return (
    status === 'awaiting_review' ||
    status === 'pr_created' ||
    status === 'changes_requested'
  );
}
