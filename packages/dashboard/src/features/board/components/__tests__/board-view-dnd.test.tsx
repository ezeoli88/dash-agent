import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { renderWithProviders, screen } from '@/test/test-utils'
import { createMockTask, resetTaskCounter } from '@/test/fixtures'
import { BoardView } from '../board-view'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'

/**
 * Tests for drag-and-drop behavior in the ACTUAL BoardView component.
 *
 * Strategy: Mock @dnd-kit/core to capture the onDragStart and onDragEnd
 * callbacks passed to DndContext, then invoke them directly with test data
 * to verify the real handleDragEnd logic triggers startTask.mutate.
 */

// ---------------------------------------------------------------------------
// Capture callbacks from DndContext
// ---------------------------------------------------------------------------

let capturedOnDragStart: ((event: DragStartEvent) => void) | undefined
let capturedOnDragEnd: ((event: DragEndEvent) => void) | undefined

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ onDragStart, onDragEnd, children }: {
    onDragStart?: (event: DragStartEvent) => void
    onDragEnd?: (event: DragEndEvent) => void
    children: React.ReactNode
    sensors?: unknown
  }) => {
    capturedOnDragStart = onDragStart
    capturedOnDragEnd = onDragEnd
    return <div data-testid="dnd-context">{children}</div>
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}))

// ---------------------------------------------------------------------------
// Mock hooks
// ---------------------------------------------------------------------------

const mockStartMutate = vi.fn()
vi.mock('@/features/tasks/hooks/use-start-task', () => ({
  useStartTask: () => ({
    mutate: mockStartMutate,
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    isSuccess: false,
    reset: vi.fn(),
  }),
}))

const draftTask = createMockTask({ id: 'draft-1', status: 'draft', title: 'Draft Task' })
const codingTask = createMockTask({ id: 'coding-1', status: 'coding', title: 'Coding Task' })

vi.mock('../../hooks/use-board-tasks', () => ({
  useBoardTasks: () => ({
    columns: {
      todo: [draftTask],
      inProgress: [codingTask],
      inReview: [],
      done: [],
      failed: [],
      canceled: [],
    },
    isLoading: false,
    isError: false,
    error: null,
    totalTasks: 2,
    getColumnCount: (id: string) => {
      const counts: Record<string, number> = { todo: 1, inProgress: 1 }
      return counts[id] ?? 0
    },
  }),
}))

vi.mock('../board-header', () => ({
  BoardHeader: () => <div data-testid="board-header">Header</div>,
}))

vi.mock('../board-column', () => ({
  BoardColumn: ({ config, tasks }: { config: { id: string; title: string }; tasks: unknown[] }) => (
    <div data-testid={`column-${config.id}`}>{config.title} ({tasks.length})</div>
  ),
  BoardColumnSkeleton: () => <div data-testid="column-skeleton">Skeleton</div>,
}))

vi.mock('../board-card', () => ({
  BoardCard: ({ task }: { task: { id: string; title: string } }) => (
    <div data-testid={`card-${task.id}`}>{task.title}</div>
  ),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/features/tasks/hooks/query-keys', () => ({
  taskKeys: { all: ['tasks'], lists: () => ['tasks', 'list'], detail: (id: string) => ['tasks', id] },
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BoardView DnD integration', () => {
  beforeEach(() => {
    resetTaskCounter()
    capturedOnDragStart = undefined
    capturedOnDragEnd = undefined
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the board with DndContext', () => {
    renderWithProviders(<BoardView />)

    expect(screen.getByTestId('dnd-context')).toBeInTheDocument()
    expect(screen.getByTestId('board-header')).toBeInTheDocument()
  })

  it('calls startTask.mutate when a draft task is dropped on inProgress column', () => {
    renderWithProviders(<BoardView />)

    // Verify callbacks were captured from the actual component
    expect(capturedOnDragStart).toBeDefined()
    expect(capturedOnDragEnd).toBeDefined()

    // Simulate drag start with a draft task (wrapped in act because it updates React state)
    act(() => {
      capturedOnDragStart!({
        active: {
          id: 'draft-1',
          data: { current: { task: draftTask } },
          rect: { current: { initial: null, translated: null } },
        },
      } as unknown as DragStartEvent)
    })

    // Simulate drop on inProgress column (wrapped in act because it reads/updates state)
    act(() => {
      capturedOnDragEnd!({
        active: {
          id: 'draft-1',
          data: { current: { task: draftTask } },
          rect: { current: { initial: null, translated: null } },
        },
        over: { id: 'inProgress', data: { current: undefined }, disabled: false, rect: null },
        collisions: null,
        delta: { x: 0, y: 0 },
        activatorEvent: null,
      } as unknown as DragEndEvent)
    })

    // Verify the REAL startTask.mutate was called with the task ID
    expect(mockStartMutate).toHaveBeenCalledWith('draft-1')
  })

  it('does NOT call startTask.mutate when a draft task is dropped on a non-inProgress column', () => {
    renderWithProviders(<BoardView />)

    // Simulate drag start with a draft task
    act(() => {
      capturedOnDragStart!({
        active: {
          id: 'draft-1',
          data: { current: { task: draftTask } },
          rect: { current: { initial: null, translated: null } },
        },
      } as unknown as DragStartEvent)
    })

    // Simulate drop on 'done' column (not inProgress)
    act(() => {
      capturedOnDragEnd!({
        active: { id: 'draft-1', data: { current: { task: draftTask } }, rect: { current: { initial: null, translated: null } } },
        over: { id: 'done', data: { current: undefined }, disabled: false, rect: null },
        collisions: null,
        delta: { x: 0, y: 0 },
        activatorEvent: null,
      } as unknown as DragEndEvent)
    })

    expect(mockStartMutate).not.toHaveBeenCalled()
  })

  it('does NOT call startTask.mutate when a non-draft task is dropped on inProgress', () => {
    renderWithProviders(<BoardView />)

    // Simulate drag start with a coding task (not draft)
    act(() => {
      capturedOnDragStart!({
        active: {
          id: 'coding-1',
          data: { current: { task: codingTask } },
          rect: { current: { initial: null, translated: null } },
        },
      } as unknown as DragStartEvent)
    })

    // Drop on inProgress
    act(() => {
      capturedOnDragEnd!({
        active: { id: 'coding-1', data: { current: { task: codingTask } }, rect: { current: { initial: null, translated: null } } },
        over: { id: 'inProgress', data: { current: undefined }, disabled: false, rect: null },
        collisions: null,
        delta: { x: 0, y: 0 },
        activatorEvent: null,
      } as unknown as DragEndEvent)
    })

    expect(mockStartMutate).not.toHaveBeenCalled()
  })

  it('does NOT call startTask.mutate when drop target is null (cancelled drag)', () => {
    renderWithProviders(<BoardView />)

    act(() => {
      capturedOnDragStart!({
        active: {
          id: 'draft-1',
          data: { current: { task: draftTask } },
          rect: { current: { initial: null, translated: null } },
        },
      } as unknown as DragStartEvent)
    })

    // over is null when the drag is cancelled
    act(() => {
      capturedOnDragEnd!({
        active: { id: 'draft-1', data: { current: { task: draftTask } }, rect: { current: { initial: null, translated: null } } },
        over: null,
        collisions: null,
        delta: { x: 0, y: 0 },
        activatorEvent: null,
      } as unknown as DragEndEvent)
    })

    expect(mockStartMutate).not.toHaveBeenCalled()
  })
})
