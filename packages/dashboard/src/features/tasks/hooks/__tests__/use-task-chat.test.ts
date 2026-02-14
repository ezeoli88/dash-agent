import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useTaskChat } from '../use-task-chat'
import type { ChatMessageEvent, ToolActivityEvent } from '@dash-agent/shared'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let idCounter = 0
vi.mock('@/lib/utils', () => ({
  generateId: vi.fn(() => `mock-id-${++idCounter}`),
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

// Store SSE callbacks so tests can invoke them directly
let sseCallbacks: {
  onChatMessage?: (event: ChatMessageEvent) => void
  onToolActivity?: (event: ToolActivityEvent) => void
  onStatusChange?: (status: string) => void
  onComplete?: (prUrl: string) => void
  onError?: (message: string) => void
}

const mockReconnect = vi.fn()
const mockDisconnect = vi.fn()
const mockClearLogs = vi.fn()
const mockAddLog = vi.fn()

vi.mock('../use-task-sse', () => ({
  useTaskSSE: (opts: Record<string, unknown>) => {
    sseCallbacks = {
      onChatMessage: opts.onChatMessage as typeof sseCallbacks.onChatMessage,
      onToolActivity: opts.onToolActivity as typeof sseCallbacks.onToolActivity,
      onStatusChange: opts.onStatusChange as typeof sseCallbacks.onStatusChange,
      onComplete: opts.onComplete as typeof sseCallbacks.onComplete,
      onError: opts.onError as typeof sseCallbacks.onError,
    }
    return {
      connectionStatus: 'connected' as const,
      logs: [],
      clearLogs: mockClearLogs,
      addLog: mockAddLog,
      reconnect: mockReconnect,
      disconnect: mockDisconnect,
    }
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTaskChat', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createTestQueryClient()
    idCounter = 0
    vi.clearAllMocks()
  })

  it('adds message entry on onChatMessage callback', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskChat({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    const chatEvent: ChatMessageEvent = {
      id: 'msg-1',
      role: 'assistant',
      content: 'Hello from agent',
      timestamp: '2026-01-01T00:00:00Z',
    }

    act(() => {
      sseCallbacks.onChatMessage?.(chatEvent)
    })

    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0]).toEqual({ type: 'message', data: chatEvent })
  })

  it('adds tool entry on onToolActivity callback', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskChat({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    const toolEvent: ToolActivityEvent = {
      id: 'tool-1',
      name: 'read_file',
      summary: 'Reading main.ts',
      status: 'running',
      timestamp: '2026-01-01T00:00:00Z',
    }

    act(() => {
      sseCallbacks.onToolActivity?.(toolEvent)
    })

    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0]).toEqual({ type: 'tool', data: toolEvent })
  })

  it('merges tool_result with existing tool_use by matching id', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskChat({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    const toolUse: ToolActivityEvent = {
      id: 'tool-merge-1',
      name: 'write_file',
      summary: 'Writing output.ts',
      status: 'running',
      timestamp: '2026-01-01T00:00:00Z',
    }

    const toolResult: ToolActivityEvent = {
      id: 'tool-merge-1',
      name: '', // tool_result events come with empty name
      summary: 'done',
      status: 'completed',
      timestamp: '2026-01-01T00:00:01Z',
    }

    act(() => {
      sseCallbacks.onToolActivity?.(toolUse)
    })
    expect(result.current.entries).toHaveLength(1)

    act(() => {
      sseCallbacks.onToolActivity?.(toolResult)
    })

    // Should still be 1 entry (merged, not added)
    expect(result.current.entries).toHaveLength(1)
    const mergedData = result.current.entries[0].data as ToolActivityEvent
    expect(mergedData.status).toBe('completed')
    // Name is preserved from the original tool_use event
    expect(mergedData.name).toBe('write_file')
    // Summary is preserved from original (not overwritten unless error)
    expect(mergedData.summary).toBe('Writing output.ts')
  })

  it('does not merge tool events when id is empty string', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskChat({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    const toolEvent1: ToolActivityEvent = {
      id: '',
      name: 'tool_a',
      summary: 'First',
      status: 'running',
      timestamp: '2026-01-01T00:00:00Z',
    }

    const toolEvent2: ToolActivityEvent = {
      id: '',
      name: 'tool_b',
      summary: 'Second',
      status: 'completed',
      timestamp: '2026-01-01T00:00:01Z',
    }

    act(() => {
      sseCallbacks.onToolActivity?.(toolEvent1)
      sseCallbacks.onToolActivity?.(toolEvent2)
    })

    // Both should be added as separate entries
    expect(result.current.entries).toHaveLength(2)
  })

  it('addUserMessage adds entry with type message and role user', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskChat({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    act(() => {
      result.current.addUserMessage('Hello from user')
    })

    expect(result.current.entries).toHaveLength(1)
    const entry = result.current.entries[0]
    expect(entry.type).toBe('message')
    const msgData = entry.data as ChatMessageEvent
    expect(msgData.role).toBe('user')
    expect(msgData.content).toBe('Hello from user')
    expect(msgData.id).toBeDefined()
    expect(msgData.timestamp).toBeDefined()
  })

  it('isConnected reflects SSE connection status', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskChat({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    // The mocked useTaskSSE returns 'connected' by default
    expect(result.current.isConnected).toBe(true)
    expect(result.current.status).toBe('connected')
  })

  it('clearEntries empties the entries array', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskChat({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    // Add some entries first
    act(() => {
      sseCallbacks.onChatMessage?.({
        id: 'msg-clear-1',
        role: 'assistant',
        content: 'Hello',
        timestamp: '2026-01-01T00:00:00Z',
      })
    })
    expect(result.current.entries).toHaveLength(1)

    act(() => {
      result.current.clearEntries()
    })

    expect(result.current.entries).toHaveLength(0)
  })

  it('clears entries and reconnects when task transitions from terminal to active', () => {
    const wrapper = createWrapper(queryClient)
    const { result, rerender } = renderHook(
      (props: { taskStatus: string }) =>
        useTaskChat({
          taskId: 'task-1',
          enabled: true,
          taskStatus: props.taskStatus,
        }),
      { wrapper, initialProps: { taskStatus: 'failed' } },
    )

    // Add an entry
    act(() => {
      sseCallbacks.onChatMessage?.({
        id: 'msg-transition-1',
        role: 'assistant',
        content: 'Previous conversation',
        timestamp: '2026-01-01T00:00:00Z',
      })
    })
    expect(result.current.entries).toHaveLength(1)

    // Transition from terminal (failed) to active (coding)
    rerender({ taskStatus: 'coding' })

    expect(result.current.entries).toHaveLength(0)
    expect(mockReconnect).toHaveBeenCalled()
  })

  it('forwards onStatusChange callback to useTaskSSE', () => {
    const onStatusChange = vi.fn()
    const wrapper = createWrapper(queryClient)
    renderHook(
      () => useTaskChat({ taskId: 'task-1', enabled: true, onStatusChange }),
      { wrapper },
    )

    act(() => {
      sseCallbacks.onStatusChange?.('review')
    })

    expect(onStatusChange).toHaveBeenCalledWith('review')
  })

  it('forwards onComplete callback to useTaskSSE', () => {
    const onComplete = vi.fn()
    const wrapper = createWrapper(queryClient)
    renderHook(
      () => useTaskChat({ taskId: 'task-1', enabled: true, onComplete }),
      { wrapper },
    )

    act(() => {
      sseCallbacks.onComplete?.('https://github.com/pull/1')
    })

    expect(onComplete).toHaveBeenCalledWith('https://github.com/pull/1')
  })

  it('forwards onError callback to useTaskSSE', () => {
    const onError = vi.fn()
    const wrapper = createWrapper(queryClient)
    renderHook(
      () => useTaskChat({ taskId: 'task-1', enabled: true, onError }),
      { wrapper },
    )

    act(() => {
      sseCallbacks.onError?.('Something broke')
    })

    expect(onError).toHaveBeenCalledWith('Something broke')
  })
})
