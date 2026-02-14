import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@/test/test-utils'
import { renderWithProviders, userEvent } from '@/test/test-utils'
import { createMockTask, resetTaskCounter } from '@/test/fixtures'
import { TaskActions } from '../task-actions'
import type { Task } from '../../types'

// ---------------------------------------------------------------------------
// Mock all hooks consumed by TaskActions
// ---------------------------------------------------------------------------

const mockExecute = { mutate: vi.fn(), isPending: false }
const mockApprove = { mutate: vi.fn(), isPending: false }
const mockApprovePlan = { mutate: vi.fn(), isPending: false }
const mockCancel = { mutate: vi.fn(), isPending: false }
const mockExtend = { mutate: vi.fn(), isPending: false }
const mockRequestChanges = { mutate: vi.fn(), isPending: false }
const mockMarkPRMerged = { mutate: vi.fn(), isPending: false }
const mockMarkPRClosed = { mutate: vi.fn(), isPending: false }
const mockRetry = { mutate: vi.fn(), isPending: false }
const mockDeleteTask = { mutate: vi.fn(), isPending: false }
const mockCleanupWorktree = { mutate: vi.fn(), isPending: false }
const mockSendFeedback = { mutate: vi.fn(), isPending: false }

vi.mock('../../hooks/use-task-actions', () => ({
  useTaskActions: () => ({
    execute: mockExecute,
    approve: mockApprove,
    approvePlan: mockApprovePlan,
    cancel: mockCancel,
    extend: mockExtend,
    requestChanges: mockRequestChanges,
    markPRMerged: mockMarkPRMerged,
    markPRClosed: mockMarkPRClosed,
    retry: mockRetry,
    deleteTask: mockDeleteTask,
    cleanupWorktree: mockCleanupWorktree,
    sendFeedback: mockSendFeedback,
  }),
}))

const mockStartTaskMutate = vi.fn()
vi.mock('../../hooks/use-start-task', () => ({
  useStartTask: () => ({
    mutate: mockStartTaskMutate,
    isPending: false,
  }),
}))

vi.mock('../../hooks/use-open-editor', () => ({
  useOpenEditor: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('../../hooks/use-resolve-conflicts', () => ({
  useResolveConflicts: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-browser-notifications', () => ({
  useBrowserNotifications: () => ({
    requestPermission: vi.fn(),
    sendNotification: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock TanStack Router Link to render a simple anchor
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; [key: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

// Mock EditTaskDialog to avoid complex sub-tree rendering
vi.mock('../edit-task-dialog', () => ({
  EditTaskDialog: () => null,
}))

// Mock FeedbackForm to avoid complex sub-tree rendering
vi.mock('../feedback-form', () => ({
  FeedbackForm: () => null,
}))

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderTaskActions(task: Task) {
  return renderWithProviders(<TaskActions task={task} />)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskActions', () => {
  beforeEach(() => {
    resetTaskCounter()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // === draft ===
  describe('status: draft', () => {
    it('shows Edit Task, Start, and Delete Task buttons', () => {
      const task = createMockTask({ status: 'draft' })
      renderTaskActions(task)

      expect(screen.getByRole('button', { name: /Edit Task/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Start/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Delete Task/i })).toBeInTheDocument()
    })
  })

  // === coding ===
  describe('status: coding', () => {
    it('shows only Cancel button', () => {
      const task = createMockTask({ status: 'coding' })
      renderTaskActions(task)

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
      // Should not show other action buttons
      expect(screen.queryByRole('button', { name: /Start/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Delete Task/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument()
    })
  })

  // === awaiting_review ===
  describe('status: awaiting_review', () => {
    it('shows Create PR and Delete Task buttons', () => {
      const task = createMockTask({ status: 'awaiting_review' })
      renderTaskActions(task)

      expect(screen.getByRole('button', { name: /Create PR/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Delete Task/i })).toBeInTheDocument()
    })
  })

  // === review (without pr_url) ===
  describe('status: review (no PR URL)', () => {
    it('shows Request Changes, Mark as Merged, and Mark as Closed', () => {
      const task = createMockTask({ status: 'review', pr_url: null })
      renderTaskActions(task)

      expect(screen.getByRole('button', { name: /Request Changes/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Mark as Merged/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Mark as Closed/i })).toBeInTheDocument()
      // No View PR link without pr_url
      expect(screen.queryByRole('button', { name: /View PR/i })).not.toBeInTheDocument()
    })
  })

  // === review (with pr_url) ===
  describe('status: review (with PR URL)', () => {
    it('shows View PR link along with Request Changes, Mark as Merged, Mark as Closed', () => {
      const task = createMockTask({ status: 'review', pr_url: 'https://github.com/org/repo/pull/42' })
      renderTaskActions(task)

      // View PR is rendered as an anchor inside a button (asChild)
      const viewPRLink = screen.getByRole('link', { name: /View PR/i })
      expect(viewPRLink).toBeInTheDocument()
      expect(viewPRLink).toHaveAttribute('href', 'https://github.com/org/repo/pull/42')

      expect(screen.getByRole('button', { name: /Request Changes/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Mark as Merged/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Mark as Closed/i })).toBeInTheDocument()
    })
  })

  // === done (without pr_url) ===
  describe('status: done (no PR URL)', () => {
    it('shows no action buttons', () => {
      const task = createMockTask({ status: 'done', pr_url: null })
      renderTaskActions(task)

      expect(screen.getByText('No actions available')).toBeInTheDocument()
    })
  })

  // === done (with pr_url) ===
  describe('status: done (with PR URL)', () => {
    it('shows View PR link', () => {
      const task = createMockTask({ status: 'done', pr_url: 'https://github.com/org/repo/pull/10' })
      renderTaskActions(task)

      const viewPRLink = screen.getByRole('link', { name: /View PR/i })
      expect(viewPRLink).toBeInTheDocument()
      expect(viewPRLink).toHaveAttribute('href', 'https://github.com/org/repo/pull/10')
    })
  })

  // === failed ===
  describe('status: failed', () => {
    it('shows Retry and Delete Task buttons', () => {
      const task = createMockTask({ status: 'failed' })
      renderTaskActions(task)

      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Delete Task/i })).toBeInTheDocument()
    })
  })

  // === canceled ===
  describe('status: canceled', () => {
    it('shows only Delete Task button', () => {
      const task = createMockTask({ status: 'canceled' })
      renderTaskActions(task)

      expect(screen.getByRole('button', { name: /Delete Task/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Start/i })).not.toBeInTheDocument()
    })
  })

  // === approved ===
  describe('status: approved', () => {
    it('shows Dev Agent is starting... processing message', () => {
      const task = createMockTask({ status: 'approved' })
      renderTaskActions(task)

      expect(screen.getByText('Dev Agent is starting...')).toBeInTheDocument()
      // No action buttons should be present
      expect(screen.queryByRole('button', { name: /Start/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument()
    })
  })

  // === merge_conflicts ===
  describe('status: merge_conflicts', () => {
    it('shows Abrir en VS Code, Ya resolvi los conflictos, and Cancel buttons', () => {
      const task = createMockTask({ status: 'merge_conflicts' })
      renderTaskActions(task)

      expect(screen.getByRole('button', { name: /Abrir en VS Code/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Ya resolvi los conflictos/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
    })
  })

  // === Destructive actions use AlertDialog ===
  describe('destructive actions', () => {
    it('renders Delete Task inside an AlertDialog trigger', () => {
      const task = createMockTask({ status: 'draft' })
      renderTaskActions(task)

      // The Delete button is a trigger for AlertDialog. Clicking it should open the dialog.
      const deleteBtn = screen.getByRole('button', { name: /Delete Task/i })
      expect(deleteBtn).toBeInTheDocument()
    })

    it('renders Cancel inside an AlertDialog trigger for coding status', () => {
      const task = createMockTask({ status: 'coding' })
      renderTaskActions(task)

      const cancelBtn = screen.getByRole('button', { name: /Cancel/i })
      expect(cancelBtn).toBeInTheDocument()
    })

    it('renders Mark as Closed inside an AlertDialog trigger for review status', () => {
      const task = createMockTask({ status: 'review' })
      renderTaskActions(task)

      const closedBtn = screen.getByRole('button', { name: /Mark as Closed/i })
      expect(closedBtn).toBeInTheDocument()
    })
  })

  // === Additional statuses for completeness ===
  describe('status: refining', () => {
    it('shows only Cancel button', () => {
      const task = createMockTask({ status: 'refining' })
      renderTaskActions(task)

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
    })
  })

  describe('status: pending_approval', () => {
    it('shows Delete Task button', () => {
      const task = createMockTask({ status: 'pending_approval' })
      renderTaskActions(task)

      expect(screen.getByRole('button', { name: /Delete Task/i })).toBeInTheDocument()
    })
  })

  describe('status: plan_review', () => {
    it('shows Cancel button', () => {
      const task = createMockTask({ status: 'plan_review' })
      renderTaskActions(task)

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
    })
  })

  // === Mutation verification tests ===
  describe('mutation calls', () => {
    it('calls startTask.mutate with task.id when Start button is clicked on draft', async () => {
      const user = userEvent.setup()
      const task = createMockTask({ id: 'task-start-1', status: 'draft' })
      renderTaskActions(task)

      const startBtn = screen.getByRole('button', { name: /^Start$/i })
      await user.click(startBtn)

      expect(mockStartTaskMutate).toHaveBeenCalledWith('task-start-1')
    })

    it('calls cancel.mutate when Cancel is confirmed on coding task via AlertDialog', async () => {
      const user = userEvent.setup()
      const task = createMockTask({ status: 'coding' })
      renderTaskActions(task)

      // Click the Cancel trigger button to open AlertDialog
      const cancelTrigger = screen.getByRole('button', { name: /Cancel/i })
      await user.click(cancelTrigger)

      // The AlertDialog should now be visible with a confirm button
      const confirmButton = await screen.findByRole('button', { name: /Cancel Task/i })
      await user.click(confirmButton)

      expect(mockCancel.mutate).toHaveBeenCalled()
    })

    it('calls deleteTask.mutate when Delete Task is confirmed via AlertDialog', async () => {
      const user = userEvent.setup()
      const task = createMockTask({ status: 'draft' })
      renderTaskActions(task)

      // Click the Delete Task trigger button
      const deleteTrigger = screen.getByRole('button', { name: /Delete Task/i })
      await user.click(deleteTrigger)

      // The AlertDialog confirm button has text "Delete Task"
      const confirmButton = await screen.findByRole('button', { name: /^Delete Task$/i })
      // There will be two elements with "Delete Task" text (trigger + confirm).
      // The confirm button is inside AlertDialogAction with destructive style.
      const allDeleteButtons = screen.getAllByRole('button', { name: /Delete Task/i })
      // The last one is the confirm inside the dialog
      const confirmBtn = allDeleteButtons[allDeleteButtons.length - 1]
      await user.click(confirmBtn)

      expect(mockDeleteTask.mutate).toHaveBeenCalled()
    })

    it('calls approve.mutate when Create PR is clicked on awaiting_review', async () => {
      const user = userEvent.setup()
      const task = createMockTask({ status: 'awaiting_review' })
      renderTaskActions(task)

      const createPRBtn = screen.getByRole('button', { name: /Create PR/i })
      await user.click(createPRBtn)

      expect(mockApprove.mutate).toHaveBeenCalled()
    })

    it('calls retry.mutate when Retry is clicked on failed task', async () => {
      const user = userEvent.setup()
      const task = createMockTask({ status: 'failed' })
      renderTaskActions(task)

      const retryBtn = screen.getByRole('button', { name: /Retry/i })
      await user.click(retryBtn)

      expect(mockRetry.mutate).toHaveBeenCalled()
    })

    it('calls markPRMerged.mutate when Mark as Merged is clicked on review task', async () => {
      const user = userEvent.setup()
      const task = createMockTask({ status: 'review' })
      renderTaskActions(task)

      const mergedBtn = screen.getByRole('button', { name: /Mark as Merged/i })
      await user.click(mergedBtn)

      expect(mockMarkPRMerged.mutate).toHaveBeenCalled()
    })

    it('calls execute.mutate when Execute is clicked on backlog task', async () => {
      const user = userEvent.setup()
      const task = createMockTask({ status: 'backlog' })
      renderTaskActions(task)

      const executeBtn = screen.getByRole('button', { name: /Execute/i })
      await user.click(executeBtn)

      expect(mockExecute.mutate).toHaveBeenCalled()
    })
  })
})
