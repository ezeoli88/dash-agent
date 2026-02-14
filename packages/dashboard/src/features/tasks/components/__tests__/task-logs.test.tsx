import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@/test/test-utils'
import { renderWithProviders, userEvent } from '@/test/test-utils'
import { createMockTask, resetTaskCounter } from '@/test/fixtures'
import { TaskLogs } from '../task-logs'
import { toast } from 'sonner'
import type { Task, LogEntry, SSEConnectionStatus } from '../../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Capture SSE callbacks to invoke them from tests
let sseCallbacks: {
  onStatusChange?: (status: string) => void
  onComplete?: (prUrl: string) => void
  onError?: (message: string) => void
  onTimeoutWarning?: (message: string) => void
}
let mockLogs: LogEntry[] = []
let mockConnectionStatus: SSEConnectionStatus = 'disconnected'
const mockClearLogs = vi.fn()
const mockAddLog = vi.fn()
const mockReconnect = vi.fn()
const mockDisconnect = vi.fn()

vi.mock('../../hooks/use-task-sse', () => ({
  useTaskSSE: (opts: Record<string, unknown>) => {
    sseCallbacks = {
      onStatusChange: opts.onStatusChange as typeof sseCallbacks.onStatusChange,
      onComplete: opts.onComplete as typeof sseCallbacks.onComplete,
      onError: opts.onError as typeof sseCallbacks.onError,
      onTimeoutWarning: opts.onTimeoutWarning as typeof sseCallbacks.onTimeoutWarning,
    }
    return {
      logs: mockLogs,
      connectionStatus: mockConnectionStatus,
      clearLogs: mockClearLogs,
      addLog: mockAddLog,
      reconnect: mockReconnect,
      disconnect: mockDisconnect,
    }
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/hooks/use-browser-notifications', () => ({
  useBrowserNotifications: () => ({
    sendNotification: vi.fn(),
    requestPermission: vi.fn(),
  }),
}))

// Mock sub-components that are not relevant to these tests
vi.mock('../feedback-form', () => ({
  FeedbackForm: ({ task }: { task: Task }) => (
    <div data-testid="feedback-form">FeedbackForm for {task.id}</div>
  ),
}))

// ---------------------------------------------------------------------------
// jsdom stubs for APIs not available in the test environment
// ---------------------------------------------------------------------------

// scrollIntoView is not implemented in jsdom
Element.prototype.scrollIntoView = vi.fn()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTaskLogs(task: Task, props: { showFeedbackForm?: boolean; enabled?: boolean } = {}) {
  return renderWithProviders(
    <TaskLogs task={task} showFeedbackForm={props.showFeedbackForm} enabled={props.enabled} />,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskLogs', () => {
  beforeEach(() => {
    resetTaskCounter()
    mockLogs = []
    mockConnectionStatus = 'disconnected'
    vi.clearAllMocks()
  })

  // ========================================================================
  // Empty state
  // ========================================================================

  it('shows "No logs yet" with execute hint when logs are empty and task is draft', () => {
    const task = createMockTask({ status: 'draft' })
    renderTaskLogs(task)

    expect(screen.getByText('No logs yet')).toBeInTheDocument()
    expect(screen.getByText('Execute the task to see logs')).toBeInTheDocument()
  })

  it('shows "Waiting for agent output..." when logs are empty and task is actively coding', () => {
    const task = createMockTask({ status: 'coding', agent_type: 'claude-code' })
    renderTaskLogs(task)

    expect(screen.getByText('No logs yet')).toBeInTheDocument()
    expect(screen.getByText(/Waiting for.*output/)).toBeInTheDocument()
  })

  // ========================================================================
  // Log rendering
  // ========================================================================

  it('renders log entries when logs exist', () => {
    mockLogs = [
      { id: 'log-1', timestamp: '2026-01-01T12:00:00Z', level: 'info', message: 'Starting task...' },
      { id: 'log-2', timestamp: '2026-01-01T12:00:01Z', level: 'error', message: 'Something failed' },
    ]

    const task = createMockTask({ status: 'coding' })
    renderTaskLogs(task)

    expect(screen.getByText('Starting task...')).toBeInTheDocument()
    expect(screen.getByText('Something failed')).toBeInTheDocument()
    expect(screen.queryByText('No logs yet')).not.toBeInTheDocument()
  })

  // ========================================================================
  // Toolbar actions
  // ========================================================================

  it('copy button calls navigator.clipboard.writeText with formatted logs', async () => {
    const user = userEvent.setup()
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })

    mockLogs = [
      { id: 'log-1', timestamp: '2026-01-01T12:00:00Z', level: 'info', message: 'Hello' },
    ]

    const task = createMockTask({ status: 'coding' })
    renderTaskLogs(task)

    const copyButton = screen.getByTitle('Copy logs')
    await user.click(copyButton)

    expect(writeTextMock).toHaveBeenCalledWith(
      '[2026-01-01T12:00:00Z] [INFO] Hello',
    )
  })

  it('clear button calls clearLogs', async () => {
    const user = userEvent.setup()
    mockLogs = [
      { id: 'log-1', timestamp: '2026-01-01T12:00:00Z', level: 'info', message: 'Hello' },
    ]

    const task = createMockTask({ status: 'coding' })
    renderTaskLogs(task)

    const clearButton = screen.getByTitle('Clear logs')
    await user.click(clearButton)

    expect(mockClearLogs).toHaveBeenCalled()
  })

  it('disables copy and clear buttons when logs are empty', () => {
    mockLogs = []
    const task = createMockTask({ status: 'coding' })
    renderTaskLogs(task)

    const copyButton = screen.getByTitle('Copy logs')
    const clearButton = screen.getByTitle('Clear logs')

    expect(copyButton).toBeDisabled()
    expect(clearButton).toBeDisabled()
  })

  // ========================================================================
  // Feedback form visibility
  // ========================================================================

  it('shows feedback form when task is active and showFeedbackForm is true', () => {
    const task = createMockTask({ status: 'coding' })
    renderTaskLogs(task, { showFeedbackForm: true })

    expect(screen.getByTestId('feedback-form')).toBeInTheDocument()
  })

  it('hides feedback form when task is not active (draft)', () => {
    const task = createMockTask({ status: 'draft' })
    renderTaskLogs(task, { showFeedbackForm: true })

    expect(screen.queryByTestId('feedback-form')).not.toBeInTheDocument()
  })

  it('hides feedback form when showFeedbackForm is false', () => {
    const task = createMockTask({ status: 'coding' })
    renderTaskLogs(task, { showFeedbackForm: false })

    expect(screen.queryByTestId('feedback-form')).not.toBeInTheDocument()
  })

  // ========================================================================
  // SSE callback toasts/notifications
  // ========================================================================

  it('onStatusChange with review triggers toast.info', () => {
    const task = createMockTask({ status: 'coding', title: 'My Task' })
    renderTaskLogs(task)

    sseCallbacks.onStatusChange?.('review')

    expect(toast.info).toHaveBeenCalledWith('PR ready for review!', { description: 'My Task' })
  })

  it('onComplete triggers toast.success', () => {
    const task = createMockTask({ status: 'coding', title: 'My Task' })
    renderTaskLogs(task)

    sseCallbacks.onComplete?.('https://github.com/pull/1')

    expect(toast.success).toHaveBeenCalledWith('Task completed!', {
      description: 'PR available at: https://github.com/pull/1',
    })
  })

  it('onComplete without PR URL shows generic success message', () => {
    const task = createMockTask({ status: 'coding', title: 'My Task' })
    renderTaskLogs(task)

    sseCallbacks.onComplete?.('')

    expect(toast.success).toHaveBeenCalledWith('Task completed!', {
      description: 'Task finished successfully',
    })
  })

  it('onError triggers toast.error', () => {
    const task = createMockTask({ status: 'coding', title: 'My Task' })
    renderTaskLogs(task)

    sseCallbacks.onError?.('Agent crashed')

    expect(toast.error).toHaveBeenCalledWith('Task error', {
      description: 'Agent crashed',
    })
  })

  it('onTimeoutWarning triggers toast.warning', () => {
    const task = createMockTask({ status: 'coding' })
    renderTaskLogs(task)

    sseCallbacks.onTimeoutWarning?.('Agent will timeout in 5 minutes')

    expect(toast.warning).toHaveBeenCalledWith('Timeout warning', {
      description: 'Agent will timeout in 5 minutes',
    })
  })
})
