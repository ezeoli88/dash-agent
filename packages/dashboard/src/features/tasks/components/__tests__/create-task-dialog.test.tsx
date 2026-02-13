import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@/test/test-utils'
import { renderWithProviders, userEvent } from '@/test/test-utils'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw-server'
import { useTaskUIStore } from '../../stores/task-ui-store'
import { useRepoStore } from '@/features/repos/stores/repo-store'
import { CreateTaskDialog } from '../create-task-dialog'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock detected agents hook to return controlled agent data
vi.mock('@/features/setup/hooks/use-detected-agents', () => ({
  useDetectedAgents: () => ({
    data: [
      {
        id: 'claude-code',
        name: 'Claude Code',
        installed: true,
        models: [
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
        ],
      },
    ],
    isLoading: false,
    isError: false,
  }),
}))

// Mock settings hook
vi.mock('@/features/setup/hooks/use-settings', () => ({
  useSettings: () => ({
    data: {
      default_agent_type: 'claude-code',
      default_agent_model: null,
    },
    isLoading: false,
  }),
}))

// Mock agent display utility
vi.mock('../../utils/agent-display', () => ({
  getAgentDisplayInfo: (id: string) => ({
    name: id === 'claude-code' ? 'Claude Code' : id,
    icon: null,
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupStores(overrides?: {
  isCreateModalOpen?: boolean
  selectedRepoId?: string | null
  selectedRepo?: { id: string; name: string; url: string; default_branch: string } | null
}) {
  useTaskUIStore.setState({
    isCreateModalOpen: overrides?.isCreateModalOpen ?? true,
    lastAgentType: null,
    lastAgentModel: null,
  })

  if (overrides?.selectedRepoId !== undefined) {
    useRepoStore.setState({
      selectedRepoId: overrides.selectedRepoId,
      selectedRepo: overrides.selectedRepo ?? null,
    })
  } else {
    useRepoStore.setState({
      selectedRepoId: 'repo-1',
      selectedRepo: {
        id: 'repo-1',
        name: 'test-repo',
        url: 'file:///test',
        default_branch: 'main',
      } as any,
    })
  }
}

function mockCreateTaskEndpoint(response?: object, statusCode?: number) {
  server.use(
    http.post('*/api/tasks', async () => {
      if (statusCode && statusCode >= 400) {
        return HttpResponse.json(
          response ?? { error: 'Server error' },
          { status: statusCode }
        )
      }
      return HttpResponse.json(
        response ?? {
          id: 'new-task-1',
          title: 'Test',
          status: 'draft',
          description: '',
          user_input: 'Test input',
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
        }
      )
    })
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateTaskDialog', () => {
  beforeEach(() => {
    setupStores()
    // Default MSW handler for task creation
    mockCreateTaskEndpoint()
    // Also mock the agents endpoint since useDetectedAgents might call it
    server.use(
      http.get('*/api/setup/agents', () => {
        return HttpResponse.json({
          agents: [
            {
              id: 'claude-code',
              name: 'Claude Code',
              installed: true,
              models: [{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' }],
            },
          ],
        })
      }),
      http.get('*/api/setup/settings', () => {
        return HttpResponse.json({
          default_agent_type: 'claude-code',
          default_agent_model: null,
        })
      })
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders dialog when isCreateModalOpen is true', () => {
    renderWithProviders(<CreateTaskDialog />)

    expect(screen.getByText('New Task')).toBeInTheDocument()
    expect(screen.getByLabelText('What do you need?')).toBeInTheDocument()
  })

  it('does not render dialog content when isCreateModalOpen is false', () => {
    useTaskUIStore.setState({ isCreateModalOpen: false })
    renderWithProviders(<CreateTaskDialog />)

    expect(screen.queryByText('New Task')).not.toBeInTheDocument()
  })

  it('disables submit button when text input is empty', () => {
    renderWithProviders(<CreateTaskDialog />)

    const submitButton = screen.getByRole('button', { name: /Create Task/i })
    expect(submitButton).toBeDisabled()
  })

  it('disables submit button when no repo is selected', () => {
    setupStores({ isCreateModalOpen: true, selectedRepoId: null, selectedRepo: null })
    renderWithProviders(<CreateTaskDialog />)

    const submitButton = screen.getByRole('button', { name: /Create Task/i })
    expect(submitButton).toBeDisabled()
  })

  it('enables submit button when text is entered and repo is selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CreateTaskDialog />)

    const textarea = screen.getByLabelText('What do you need?')
    await user.type(textarea, 'Add a date filter')

    const submitButton = screen.getByRole('button', { name: /Create Task/i })
    expect(submitButton).toBeEnabled()
  })

  it('submits successfully and closes dialog', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')

    renderWithProviders(<CreateTaskDialog />)

    const textarea = screen.getByLabelText('What do you need?')
    await user.type(textarea, 'Add a date filter to the transactions list')

    const submitButton = screen.getByRole('button', { name: /Create Task/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Task created', expect.anything())
    })

    // Dialog should close
    await waitFor(() => {
      expect(useTaskUIStore.getState().isCreateModalOpen).toBe(false)
    })
  })

  it('shows error toast when task creation fails', async () => {
    mockCreateTaskEndpoint({ error: 'Internal server error' }, 500)

    const user = userEvent.setup()
    const { toast } = await import('sonner')

    renderWithProviders(<CreateTaskDialog />)

    const textarea = screen.getByLabelText('What do you need?')
    await user.type(textarea, 'Some task that will fail')

    const submitButton = screen.getByRole('button', { name: /Create Task/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to create task', expect.anything())
    })
  })

  it('persists last agent type in store after successful creation', async () => {
    const user = userEvent.setup()

    renderWithProviders(<CreateTaskDialog />)

    const textarea = screen.getByLabelText('What do you need?')
    await user.type(textarea, 'Test task for agent persistence')

    const submitButton = screen.getByRole('button', { name: /Create Task/i })
    await user.click(submitButton)

    await waitFor(() => {
      const state = useTaskUIStore.getState()
      expect(state.lastAgentType).toBe('claude-code')
    })
  })

  it('sends correct payload in POST /api/tasks request', async () => {
    // Capture the request body sent to the server
    let capturedPayload: Record<string, unknown> | null = null

    server.use(
      http.post('*/api/tasks', async ({ request }) => {
        capturedPayload = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          id: 'new-task-payload',
          title: 'Add a date filter',
          status: 'draft',
          description: 'Add a date filter',
          user_input: 'Add a date filter',
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
        })
      })
    )

    const user = userEvent.setup()
    renderWithProviders(<CreateTaskDialog />)

    const textarea = screen.getByLabelText('What do you need?')
    await user.type(textarea, 'Add a date filter')

    const submitButton = screen.getByRole('button', { name: /Create Task/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(capturedPayload).not.toBeNull()
    })

    expect(capturedPayload).toMatchObject({
      repository_id: 'repo-1',
      user_input: 'Add a date filter',
      title: 'Add a date filter',
      repo_url: expect.any(String),
      target_branch: 'main',
      context_files: [],
      agent_type: 'claude-code',
    })

    // Verify description mirrors user_input
    expect(capturedPayload!.description).toBe('Add a date filter')
  })
})
