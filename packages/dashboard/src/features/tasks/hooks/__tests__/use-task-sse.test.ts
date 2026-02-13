import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useTaskSSE } from '../use-task-sse'
import { useTaskUIStore } from '../../stores/task-ui-store'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  getAuthToken: vi.fn(() => 'test-token'),
}))

let idCounter = 0
vi.mock('@/lib/utils', () => ({
  generateId: vi.fn(() => `mock-id-${++idCounter}`),
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
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

/** Retrieves the most-recently created MockEventSource instance. */
function getLatestEventSource() {
  const instances = (EventSource as unknown as { instances: Array<{
    url: string
    readyState: number
    simulateOpen: () => void
    simulateMessage: (type: string, data: string) => void
    simulateError: () => void
    close: () => void
  }> }).instances
  return instances[instances.length - 1]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTaskSSE', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createTestQueryClient()
    idCounter = 0
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ========================================================================
  // Connection management
  // ========================================================================

  it('creates EventSource with correct URL including token', () => {
    const wrapper = createWrapper(queryClient)
    renderHook(() => useTaskSSE({ taskId: 'task-1', enabled: true }), { wrapper })

    const es = getLatestEventSource()
    expect(es).toBeDefined()
    expect(es.url).toContain('/api/tasks/task-1/logs')
    expect(es.url).toContain('token=test-token')
  })

  it('transitions connection status: disconnected -> connecting -> connected', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    // After creating EventSource but before onopen: connecting
    expect(result.current.connectionStatus).toBe('connecting')

    // Simulate the connection opening
    const es = getLatestEventSource()
    act(() => {
      es.simulateOpen()
    })

    expect(result.current.connectionStatus).toBe('connected')
  })

  it('does not create EventSource when enabled is false', () => {
    const wrapper = createWrapper(queryClient)
    renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: false }),
      { wrapper },
    )

    const instances = (EventSource as unknown as { instances: unknown[] }).instances
    expect(instances.length).toBe(0)
  })

  it('does not create EventSource when taskId is empty', () => {
    const wrapper = createWrapper(queryClient)
    renderHook(
      () => useTaskSSE({ taskId: '', enabled: true }),
      { wrapper },
    )

    const instances = (EventSource as unknown as { instances: unknown[] }).instances
    expect(instances.length).toBe(0)
  })

  it('disconnect closes EventSource and sets status to disconnected', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    const es = getLatestEventSource()
    act(() => { es.simulateOpen() })
    expect(result.current.connectionStatus).toBe('connected')

    act(() => { result.current.disconnect() })
    expect(result.current.connectionStatus).toBe('disconnected')
    expect(es.readyState).toBe(2) // CLOSED
  })

  // ========================================================================
  // Event handling: log
  // ========================================================================

  it('adds log entry to Zustand store on log event', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    const es = getLatestEventSource()
    act(() => {
      es.simulateOpen()
      es.simulateMessage('log', JSON.stringify({
        timestamp: '2026-01-01T00:00:00Z',
        level: 'info',
        message: 'Hello world',
      }))
    })

    expect(result.current.logs).toHaveLength(1)
    expect(result.current.logs[0]).toMatchObject({
      level: 'info',
      message: 'Hello world',
      timestamp: '2026-01-01T00:00:00Z',
    })
  })

  // ========================================================================
  // Event handling: status
  // ========================================================================

  it('calls onStatusChange callback on status event', () => {
    const onStatusChange = vi.fn()
    const wrapper = createWrapper(queryClient)
    renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true, onStatusChange }),
      { wrapper },
    )

    const es = getLatestEventSource()
    act(() => {
      es.simulateOpen()
      es.simulateMessage('status', JSON.stringify({ status: 'review' }))
    })

    expect(onStatusChange).toHaveBeenCalledWith('review')
  })

  // ========================================================================
  // Event handling: timeout_warning
  // ========================================================================

  it('calls onTimeoutWarning callback on timeout_warning event', () => {
    const onTimeoutWarning = vi.fn()
    const wrapper = createWrapper(queryClient)
    renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true, onTimeoutWarning }),
      { wrapper },
    )

    const es = getLatestEventSource()
    act(() => {
      es.simulateOpen()
      es.simulateMessage('timeout_warning', JSON.stringify({
        message: 'Agent will timeout',
        expires_at: '2026-01-01T01:00:00Z',
      }))
    })

    expect(onTimeoutWarning).toHaveBeenCalledWith('Agent will timeout', '2026-01-01T01:00:00Z')
  })

  // ========================================================================
  // Event handling: awaiting_review
  // ========================================================================

  it('adds special log entry with level agent on awaiting_review event', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    const es = getLatestEventSource()
    act(() => {
      es.simulateOpen()
      es.simulateMessage('awaiting_review', JSON.stringify({
        message: 'Please review my changes',
      }))
    })

    expect(result.current.logs).toHaveLength(1)
    expect(result.current.logs[0]).toMatchObject({
      level: 'agent',
      message: 'Please review my changes',
    })
  })

  // ========================================================================
  // Event handling: complete (terminal)
  // ========================================================================

  it('calls onComplete, closes EventSource, and does NOT reconnect on complete event', () => {
    const onComplete = vi.fn()
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true, onComplete }),
      { wrapper },
    )

    const es = getLatestEventSource()
    act(() => {
      es.simulateOpen()
      es.simulateMessage('complete', JSON.stringify({ pr_url: 'https://github.com/pull/1' }))
    })

    expect(onComplete).toHaveBeenCalledWith('https://github.com/pull/1')
    expect(result.current.connectionStatus).toBe('disconnected')
    expect(es.readyState).toBe(2)

    // Simulate connection error after terminal event - should NOT reconnect
    const instancesBefore = (EventSource as unknown as { instances: unknown[] }).instances.length
    act(() => {
      es.simulateError()
      vi.advanceTimersByTime(5000)
    })
    const instancesAfter = (EventSource as unknown as { instances: unknown[] }).instances.length
    expect(instancesAfter).toBe(instancesBefore)
  })

  // ========================================================================
  // Event handling: error data event
  // ========================================================================

  it('calls onError callback on error data event', () => {
    const onError = vi.fn()
    const wrapper = createWrapper(queryClient)
    renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true, onError }),
      { wrapper },
    )

    const es = getLatestEventSource()
    act(() => {
      es.simulateOpen()
      es.simulateMessage('error', JSON.stringify({
        message: 'Something failed',
        code: 'AGENT_ERROR',
      }))
    })

    expect(onError).toHaveBeenCalledWith('Something failed')
  })

  it('does NOT call onError when error code is CANCELLED', () => {
    const onError = vi.fn()
    const wrapper = createWrapper(queryClient)
    renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true, onError }),
      { wrapper },
    )

    const es = getLatestEventSource()
    act(() => {
      es.simulateOpen()
      es.simulateMessage('error', JSON.stringify({
        message: 'Task was cancelled',
        code: 'CANCELLED',
      }))
    })

    expect(onError).not.toHaveBeenCalled()
  })

  // ========================================================================
  // Event handling: pr_comment
  // ========================================================================

  it('calls onPRComment callback on pr_comment event', () => {
    const onPRComment = vi.fn()
    const wrapper = createWrapper(queryClient)
    renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true, onPRComment }),
      { wrapper },
    )

    const es = getLatestEventSource()
    const mockComment = { id: 1, body: 'Looks good', author: { login: 'user1' } }
    act(() => {
      es.simulateOpen()
      es.simulateMessage('pr_comment', JSON.stringify({ comment: mockComment }))
    })

    expect(onPRComment).toHaveBeenCalledWith(mockComment)
  })

  // ========================================================================
  // Event handling: chat_message
  // ========================================================================

  it('calls onChatMessage callback on chat_message event', () => {
    const onChatMessage = vi.fn()
    const wrapper = createWrapper(queryClient)
    renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true, onChatMessage }),
      { wrapper },
    )

    const es = getLatestEventSource()
    const chatEvent = { id: 'msg-1', role: 'assistant', content: 'Hello', timestamp: '2026-01-01T00:00:00Z' }
    act(() => {
      es.simulateOpen()
      es.simulateMessage('chat_message', JSON.stringify(chatEvent))
    })

    expect(onChatMessage).toHaveBeenCalledWith(chatEvent)
  })

  // ========================================================================
  // Event handling: tool_activity
  // ========================================================================

  it('calls onToolActivity callback on tool_activity event', () => {
    const onToolActivity = vi.fn()
    const wrapper = createWrapper(queryClient)
    renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true, onToolActivity }),
      { wrapper },
    )

    const es = getLatestEventSource()
    const toolEvent = { id: 'tool-1', name: 'read_file', summary: 'Reading file.ts', status: 'running', timestamp: '2026-01-01T00:00:00Z' }
    act(() => {
      es.simulateOpen()
      es.simulateMessage('tool_activity', JSON.stringify(toolEvent))
    })

    expect(onToolActivity).toHaveBeenCalledWith(toolEvent)
  })

  // ========================================================================
  // Reconnection behavior
  // ========================================================================

  it('reconnects after 3 seconds on connection error without terminal event', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    const es = getLatestEventSource()
    act(() => { es.simulateOpen() })
    expect(result.current.connectionStatus).toBe('connected')

    // Simulate connection error (not a terminal data event)
    act(() => { es.simulateError() })
    expect(result.current.connectionStatus).toBe('error')

    const instancesBefore = (EventSource as unknown as { instances: unknown[] }).instances.length

    // Advance timers past the 3s reconnect delay
    act(() => { vi.advanceTimersByTime(3000) })

    const instancesAfter = (EventSource as unknown as { instances: unknown[] }).instances.length
    // A new EventSource should have been created for reconnection
    expect(instancesAfter).toBeGreaterThan(instancesBefore)
  })

  it('does NOT reconnect after connection error when terminal event was received', () => {
    const wrapper = createWrapper(queryClient)
    renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true, onComplete: vi.fn() }),
      { wrapper },
    )

    const es = getLatestEventSource()
    act(() => {
      es.simulateOpen()
      // Receive terminal event first
      es.simulateMessage('complete', JSON.stringify({ pr_url: '' }))
    })

    const instancesBefore = (EventSource as unknown as { instances: unknown[] }).instances.length

    act(() => {
      es.simulateError()
      vi.advanceTimersByTime(5000)
    })

    const instancesAfter = (EventSource as unknown as { instances: unknown[] }).instances.length
    expect(instancesAfter).toBe(instancesBefore)
  })

  // ========================================================================
  // Utility methods
  // ========================================================================

  it('clearLogs removes logs from Zustand store', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    const es = getLatestEventSource()
    act(() => {
      es.simulateOpen()
      es.simulateMessage('log', JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'Test' }))
    })
    expect(result.current.logs).toHaveLength(1)

    act(() => { result.current.clearLogs() })
    expect(result.current.logs).toHaveLength(0)
  })

  it('addLog manually adds a log entry', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    act(() => {
      result.current.addLog({
        timestamp: '2026-01-01T00:00:00Z',
        level: 'user',
        message: 'Manual log',
      })
    })

    expect(result.current.logs).toHaveLength(1)
    expect(result.current.logs[0]).toMatchObject({
      level: 'user',
      message: 'Manual log',
    })
  })

  it('reconnect creates a new EventSource connection', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskSSE({ taskId: 'task-1', enabled: true }),
      { wrapper },
    )

    const instancesBefore = (EventSource as unknown as { instances: unknown[] }).instances.length

    act(() => { result.current.reconnect() })

    const instancesAfter = (EventSource as unknown as { instances: unknown[] }).instances.length
    expect(instancesAfter).toBeGreaterThan(instancesBefore)
  })
})
