import type { TaskStatus } from '../schemas/task.schema.js';

/**
 * Labels for task statuses (for UI display)
 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  // New two-agent workflow statuses
  draft: 'Draft',
  refining: 'Generating Spec',
  pending_approval: 'Review Spec',
  approved: 'Approved',
  coding: 'Coding',
  plan_review: 'Review Plan',
  review: 'PR Review',
  merge_conflicts: 'Merge Conflicts',
  changes_requested: 'Changes Requested',
  done: 'Done',
  failed: 'Failed',
  canceled: 'Canceled',
  // Legacy statuses (for backward compatibility)
  backlog: 'Backlog',
  planning: 'Planning',
  in_progress: 'In Progress',
  awaiting_review: 'Awaiting Review',
  pr_created: 'PR Created',
};

/**
 * Colors/CSS classes for task statuses (Tailwind classes)
 */
export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  // New two-agent workflow statuses
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
  refining: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  pending_approval: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  coding: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  plan_review: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100',
  review: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
  merge_conflicts: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100',
  changes_requested: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  canceled: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
  // Legacy statuses (for backward compatibility)
  backlog: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
  planning: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  awaiting_review: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
  pr_created: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100',
};

/**
 * Determines which actions are available for a given task status.
 * Updated for the two-agent workflow.
 */
export function getAvailableActionsForStatus(
  status: TaskStatus
): readonly string[] {
  switch (status) {
    // Two-agent workflow statuses
    case 'draft':
      return ['generate_spec', 'delete'] as const;
    case 'refining':
      return ['cancel'] as const;
    case 'pending_approval':
      return ['approve_spec', 'regenerate_spec', 'edit_spec', 'delete'] as const;
    case 'approved':
      return ['cancel'] as const;  // Dev Agent starting
    case 'coding':
      return ['extend', 'cancel', 'feedback'] as const;
    case 'plan_review':
      return ['approve_plan', 'cancel'] as const;
    case 'review':
      return ['request_changes', 'mark_merged', 'mark_closed'] as const;
    case 'merge_conflicts':
      return ['open_vscode', 'mark_resolved', 'cancel'] as const;
    case 'changes_requested':
      return ['execute', 'mark_closed'] as const;  // Resume or close
    case 'done':
      return ['view_pr'] as const;
    case 'failed':
      return ['retry', 'delete'] as const;
    case 'canceled':
      return ['retry', 'delete'] as const;
    // Legacy statuses (for backward compatibility)
    case 'backlog':
      return ['execute', 'delete'] as const;
    case 'planning':
      return ['cancel'] as const;
    case 'in_progress':
      return ['extend', 'cancel', 'feedback'] as const;
    case 'awaiting_review':
      return ['approve', 'cancel'] as const;
    case 'pr_created':
      return ['request_changes', 'mark_merged', 'mark_closed'] as const;
    default:
      return [] as const;
  }
}

/**
 * Checks if a task is in a terminal state (cannot progress further).
 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'done' || status === 'failed' || status === 'canceled';
}

/**
 * Checks if a task is actively being worked on (by PM Agent or Dev Agent).
 */
export function isActiveStatus(status: TaskStatus): boolean {
  return (
    status === 'refining' ||      // PM Agent working
    status === 'approved' ||      // Dev Agent starting
    status === 'coding' ||        // Dev Agent working
    // Legacy
    status === 'planning' ||
    status === 'in_progress'
  );
}

/**
 * Checks if a task requires user attention/action.
 */
export function requiresUserAction(status: TaskStatus): boolean {
  return (
    status === 'draft' ||           // User needs to start
    status === 'pending_approval' || // User needs to review/approve spec
    status === 'plan_review' ||     // User needs to approve plan
    status === 'review' ||          // User needs to review PR
    status === 'merge_conflicts' || // User needs to resolve conflicts
    status === 'changes_requested' || // User requested changes
    // Legacy
    status === 'backlog' ||
    status === 'awaiting_review' ||
    status === 'pr_created'
  );
}

/**
 * Checks if a task is in the spec phase (PM Agent workflow).
 */
export function isSpecPhase(status: TaskStatus): boolean {
  return (
    status === 'draft' ||
    status === 'refining' ||
    status === 'pending_approval'
  );
}

/**
 * Checks if a task is in the coding phase (Dev Agent workflow).
 */
export function isCodingPhase(status: TaskStatus): boolean {
  return (
    status === 'approved' ||
    status === 'coding' ||
    status === 'plan_review' ||
    status === 'review' ||
    status === 'merge_conflicts' ||
    status === 'changes_requested' ||
    // Legacy
    status === 'in_progress' ||
    status === 'awaiting_review' ||
    status === 'pr_created'
  );
}

/**
 * Maps legacy status to new two-agent workflow status.
 */
export function mapLegacyStatus(status: TaskStatus): TaskStatus {
  switch (status) {
    case 'backlog':
      return 'draft';
    case 'planning':
      return 'refining';
    case 'in_progress':
      return 'coding';
    case 'awaiting_review':
      return 'review';
    case 'pr_created':
      return 'review';
    default:
      return status;
  }
}

/**
 * Gets the phase name for a task status.
 */
export function getPhaseForStatus(status: TaskStatus): 'spec' | 'coding' | 'complete' {
  if (isSpecPhase(status)) return 'spec';
  if (isTerminalStatus(status)) return 'complete';
  return 'coding';
}
