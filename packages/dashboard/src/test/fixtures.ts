import type { Task, TaskStatus } from '@/features/tasks/types'

let taskCounter = 0

/**
 * Creates a mock Task object with sensible defaults.
 * Override any field via the `overrides` parameter.
 */
export function createMockTask(overrides: Partial<Task> & { status?: TaskStatus } = {}): Task {
  taskCounter++
  return {
    id: `task-${taskCounter}`,
    title: `Test Task ${taskCounter}`,
    description: 'Test description',
    user_input: 'Test input',
    status: 'draft',
    repository_id: 'repo-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    pr_url: null,
    pr_number: null,
    branch_name: null,
    agent_type: 'claude-code',
    agent_model: null,
    spec: null,
    plan: null,
    context_files: [],
    target_branch: 'main',
    repo_url: '',
    ...overrides,
  } as Task
}

export function resetTaskCounter() {
  taskCounter = 0
}

/**
 * Pre-built task fixtures for common statuses.
 * Useful for tests that need specific task states without calling createMockTask repeatedly.
 */
export const TASK_FIXTURES = {
  draft: createMockTask({ status: 'draft' }),
  coding: createMockTask({ status: 'coding' }),
  review: createMockTask({ status: 'review', pr_url: 'https://github.com/org/repo/pull/1' }),
  done: createMockTask({ status: 'done', pr_url: 'https://github.com/org/repo/pull/1' }),
  failed: createMockTask({ status: 'failed' }),
  canceled: createMockTask({ status: 'canceled' }),
  merge_conflicts: createMockTask({ status: 'merge_conflicts' }),
  awaiting_review: createMockTask({ status: 'awaiting_review' }),
  refining: createMockTask({ status: 'refining' }),
  pr_created: createMockTask({ status: 'pr_created', pr_url: 'https://github.com/org/repo/pull/2' }),
}
