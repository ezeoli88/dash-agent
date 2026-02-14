import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw-server'
import { createMockTask, resetTaskCounter } from '@/test/fixtures'
import { createTestQueryClient } from '@/test/test-utils'
import { QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useBoardTasks, getColumnConfig } from '../use-board-tasks'
import type { Task, TaskStatus } from '@/features/tasks/types'

// ---------------------------------------------------------------------------
// Helper: wrapper with QueryClientProvider for renderHook
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = createTestQueryClient()
  return {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
    queryClient,
  }
}

// ---------------------------------------------------------------------------
// Helper: set up MSW handler to return specific tasks
// ---------------------------------------------------------------------------

function mockTasksEndpoint(tasks: Task[]) {
  server.use(
    http.get('*/api/tasks', () => {
      return HttpResponse.json(tasks)
    })
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useBoardTasks', () => {
  beforeEach(() => {
    resetTaskCounter()
  })

  afterEach(() => {
    resetTaskCounter()
  })

  it('returns all columns empty when tasks array is empty', async () => {
    mockTasksEndpoint([])
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useBoardTasks(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.columns.todo).toHaveLength(0)
    expect(result.current.columns.inProgress).toHaveLength(0)
    expect(result.current.columns.inReview).toHaveLength(0)
    expect(result.current.columns.done).toHaveLength(0)
    expect(result.current.columns.failed).toHaveLength(0)
    expect(result.current.columns.canceled).toHaveLength(0)
    expect(result.current.totalTasks).toBe(0)
  })

  it('groups tasks into correct columns based on status', async () => {
    const tasks = [
      createMockTask({ status: 'draft' }),
      createMockTask({ status: 'coding' }),
      createMockTask({ status: 'awaiting_review' }),
      createMockTask({ status: 'done' }),
      createMockTask({ status: 'failed' }),
      createMockTask({ status: 'canceled' }),
    ]
    mockTasksEndpoint(tasks)
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useBoardTasks(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.columns.todo).toHaveLength(1)
    expect(result.current.columns.todo[0].status).toBe('draft')

    expect(result.current.columns.inProgress).toHaveLength(1)
    expect(result.current.columns.inProgress[0].status).toBe('coding')

    expect(result.current.columns.inReview).toHaveLength(1)
    expect(result.current.columns.inReview[0].status).toBe('awaiting_review')

    expect(result.current.columns.done).toHaveLength(1)
    expect(result.current.columns.done[0].status).toBe('done')

    expect(result.current.columns.failed).toHaveLength(1)
    expect(result.current.columns.failed[0].status).toBe('failed')

    expect(result.current.columns.canceled).toHaveLength(1)
    expect(result.current.columns.canceled[0].status).toBe('canceled')
  })

  it('maps multiple statuses to the same column (inProgress)', async () => {
    const tasks = [
      createMockTask({ status: 'refining' }),
      createMockTask({ status: 'approved' }),
      createMockTask({ status: 'coding' }),
      createMockTask({ status: 'pending_approval' }),
      createMockTask({ status: 'planning' }),
      createMockTask({ status: 'in_progress' }),
    ]
    mockTasksEndpoint(tasks)
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useBoardTasks(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.columns.inProgress).toHaveLength(6)
    // All should be in inProgress column
    const statuses = result.current.columns.inProgress.map((t) => t.status)
    expect(statuses).toContain('refining')
    expect(statuses).toContain('approved')
    expect(statuses).toContain('coding')
    expect(statuses).toContain('pending_approval')
    expect(statuses).toContain('planning')
    expect(statuses).toContain('in_progress')
  })

  it('maps multiple statuses to inReview column', async () => {
    const tasks = [
      createMockTask({ status: 'awaiting_review' }),
      createMockTask({ status: 'review' }),
      createMockTask({ status: 'plan_review' }),
      createMockTask({ status: 'changes_requested' }),
      createMockTask({ status: 'merge_conflicts' }),
      createMockTask({ status: 'pr_created' }),
    ]
    mockTasksEndpoint(tasks)
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useBoardTasks(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.columns.inReview).toHaveLength(6)
  })

  it('maps draft and backlog to the todo column', async () => {
    const tasks = [
      createMockTask({ status: 'draft' }),
      createMockTask({ status: 'backlog' }),
    ]
    mockTasksEndpoint(tasks)
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useBoardTasks(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.columns.todo).toHaveLength(2)
  })

  it('sorts tasks within each column by updated_at descending (most recent first)', async () => {
    const oldTask = createMockTask({
      status: 'draft',
      updated_at: '2024-01-01T00:00:00Z',
    })
    const midTask = createMockTask({
      status: 'draft',
      updated_at: '2024-06-15T00:00:00Z',
    })
    const newTask = createMockTask({
      status: 'draft',
      updated_at: '2025-01-01T00:00:00Z',
    })
    mockTasksEndpoint([oldTask, midTask, newTask])
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useBoardTasks(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.columns.todo).toHaveLength(3)
    // Most recent first
    expect(result.current.columns.todo[0].id).toBe(newTask.id)
    expect(result.current.columns.todo[1].id).toBe(midTask.id)
    expect(result.current.columns.todo[2].id).toBe(oldTask.id)
  })

  it('returns correct totalTasks count', async () => {
    const tasks = [
      createMockTask({ status: 'draft' }),
      createMockTask({ status: 'coding' }),
      createMockTask({ status: 'done' }),
      createMockTask({ status: 'failed' }),
    ]
    mockTasksEndpoint(tasks)
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useBoardTasks(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.totalTasks).toBe(4)
  })

  it('getColumnCount returns correct count per column', async () => {
    const tasks = [
      createMockTask({ status: 'draft' }),
      createMockTask({ status: 'draft' }),
      createMockTask({ status: 'coding' }),
      createMockTask({ status: 'done' }),
    ]
    mockTasksEndpoint(tasks)
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useBoardTasks(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.getColumnCount('todo')).toBe(2)
    expect(result.current.getColumnCount('inProgress')).toBe(1)
    expect(result.current.getColumnCount('done')).toBe(1)
    expect(result.current.getColumnCount('inReview')).toBe(0)
    expect(result.current.getColumnCount('failed')).toBe(0)
    expect(result.current.getColumnCount('canceled')).toBe(0)
  })

  it('filters tasks by repositoryId when provided', async () => {
    const tasks = [
      createMockTask({ status: 'draft', repository_id: 'repo-1' }),
      createMockTask({ status: 'draft', repository_id: 'repo-2' }),
      createMockTask({ status: 'coding', repository_id: 'repo-1' }),
    ]
    mockTasksEndpoint(tasks)
    const { wrapper } = createWrapper()

    const { result } = renderHook(
      () => useBoardTasks({ repositoryId: 'repo-1' }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Only repo-1 tasks should appear
    expect(result.current.totalTasks).toBe(2)
    expect(result.current.columns.todo).toHaveLength(1)
    expect(result.current.columns.inProgress).toHaveLength(1)
  })
})

describe('getColumnConfig', () => {
  it('returns column config for a valid column id', () => {
    const config = getColumnConfig('todo')
    expect(config).toBeDefined()
    expect(config?.id).toBe('todo')
    expect(config?.title).toBe('To Do')
  })

  it('returns undefined for an invalid column id', () => {
    const config = getColumnConfig('invalid' as never)
    expect(config).toBeUndefined()
  })
})
