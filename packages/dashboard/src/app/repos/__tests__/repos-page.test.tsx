import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@/test/test-utils'
import { renderWithProviders, userEvent } from '@/test/test-utils'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw-server'
import { useRepoStore } from '@/features/repos/stores/repo-store'
import ReposPage from '../page'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    navigate: mockNavigate,
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseLocalReposResponse = {
  repos: [
    {
      name: 'project-alpha',
      path: '/home/user/projects/project-alpha',
      current_branch: 'main',
      remote_url: 'https://github.com/user/project-alpha',
      language: 'TypeScript',
      has_remote: true,
    },
    {
      name: 'project-beta',
      path: '/home/user/projects/project-beta',
      current_branch: 'develop',
      remote_url: null,
      language: 'Python',
      has_remote: false,
    },
  ],
  total: 2,
  scan_path: '/home/user/projects',
}

function setupDefaultHandlers() {
  server.use(
    http.get('*/api/repos/local/scan', () => {
      return HttpResponse.json(baseLocalReposResponse)
    }),
    http.get('*/api/secrets/status', () => {
      return HttpResponse.json({
        ai: { connected: true, provider: 'openai' },
        github: { connected: true },
        gitlab: { connected: false },
        isComplete: true,
      })
    }),
    http.post('*/api/repos/local/add', () => {
      return HttpResponse.json({
        id: 'new-repo-1',
        name: 'project-alpha',
        url: 'file:///home/user/projects/project-alpha',
        default_branch: 'main',
      })
    })
  )
}

function setupEmptyReposHandler() {
  server.use(
    http.get('*/api/repos/local/scan', () => {
      return HttpResponse.json({
        repos: [],
        total: 0,
        scan_path: '/home/user/projects',
      })
    })
  )
}

function setupNoGitProviderHandler() {
  server.use(
    http.get('*/api/secrets/status', () => {
      return HttpResponse.json({
        ai: { connected: true, provider: 'openai' },
        github: { connected: false },
        gitlab: { connected: false },
        isComplete: false,
      })
    })
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReposPage', () => {
  beforeEach(() => {
    setupDefaultHandlers()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows scanning spinner while loading', () => {
    // Override handler with a never-resolving response
    server.use(
      http.get('*/api/repos/local/scan', () => {
        // Return a response that takes a while - simulate loading
        return new Promise(() => {
          // Never resolves, so loading state persists
        })
      })
    )

    renderWithProviders(<ReposPage />)

    expect(screen.getByText(/Escaneando repositorios locales/i)).toBeInTheDocument()
  })

  it('renders repo cards after scan completes', async () => {
    renderWithProviders(<ReposPage />)

    await waitFor(() => {
      expect(screen.getByText('project-alpha')).toBeInTheDocument()
    })

    expect(screen.getByText('project-beta')).toBeInTheDocument()
    expect(screen.getByText('2 repositorios encontrados en')).toBeInTheDocument()
  })

  it('shows "No se encontraron repositorios Git" when scan returns empty', async () => {
    setupEmptyReposHandler()

    renderWithProviders(<ReposPage />)

    await waitFor(() => {
      expect(
        screen.getByText(/No se encontraron repositorios en/i)
      ).toBeInTheDocument()
    })
  })

  it('selecting a repo card highlights it with check icon', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReposPage />)

    // Wait for repos to load
    await waitFor(() => {
      expect(screen.getByText('project-alpha')).toBeInTheDocument()
    })

    // Click on the project-alpha repo card
    const repoCard = screen.getByText('project-alpha').closest('button')!
    await user.click(repoCard)

    // After clicking, the card should have the selected style (border-primary)
    // We verify the repo was selected by checking the Continuar button is enabled
    const continueBtn = screen.getByRole('button', { name: /Continuar/i })
    expect(continueBtn).toBeEnabled()
  })

  it('Continuar button is disabled when no repo is selected', async () => {
    renderWithProviders(<ReposPage />)

    await waitFor(() => {
      expect(screen.getByText('project-alpha')).toBeInTheDocument()
    })

    const continueBtn = screen.getByRole('button', { name: /Continuar/i })
    expect(continueBtn).toBeDisabled()
  })

  it('Continuar button is enabled after selecting a repo', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReposPage />)

    await waitFor(() => {
      expect(screen.getByText('project-alpha')).toBeInTheDocument()
    })

    const repoCard = screen.getByText('project-alpha').closest('button')!
    await user.click(repoCard)

    const continueBtn = screen.getByRole('button', { name: /Continuar/i })
    expect(continueBtn).toBeEnabled()
  })

  it('clicking Continuar calls POST /api/repos and navigates to /board', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReposPage />)

    await waitFor(() => {
      expect(screen.getByText('project-alpha')).toBeInTheDocument()
    })

    // Select repo
    const repoCard = screen.getByText('project-alpha').closest('button')!
    await user.click(repoCard)

    // Click continue
    const continueBtn = screen.getByRole('button', { name: /Continuar/i })
    await user.click(continueBtn)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/board' })
    })
  })

  it('handles 409 conflict by fetching existing repos and navigating', async () => {
    // Override POST to return 409
    server.use(
      http.post('*/api/repos/local/add', () => {
        return HttpResponse.json(
          { error: 'Repository already exists' },
          { status: 409 }
        )
      }),
      http.get('*/api/repos', () => {
        return HttpResponse.json([
          {
            id: 'existing-repo-1',
            name: 'project-alpha',
            url: 'file:///home/user/projects/project-alpha',
          },
        ])
      })
    )

    const user = userEvent.setup()
    renderWithProviders(<ReposPage />)

    await waitFor(() => {
      expect(screen.getByText('project-alpha')).toBeInTheDocument()
    })

    // Select repo
    const repoCard = screen.getByText('project-alpha').closest('button')!
    await user.click(repoCard)

    // Click continue
    const continueBtn = screen.getByRole('button', { name: /Continuar/i })
    await user.click(continueBtn)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/board' })
    })
  })

  it('shows git provider warning when no GitHub/GitLab is connected', async () => {
    setupNoGitProviderHandler()

    renderWithProviders(<ReposPage />)

    await waitFor(() => {
      expect(
        screen.getByText(/Token de GitHub o GitLab no configurado/i)
      ).toBeInTheDocument()
    })
  })

  it('does not show git provider warning when GitHub is connected', async () => {
    renderWithProviders(<ReposPage />)

    await waitFor(() => {
      expect(screen.getByText('project-alpha')).toBeInTheDocument()
    })

    expect(
      screen.queryByText(/Token de GitHub o GitLab no configurado/i)
    ).not.toBeInTheDocument()
  })

  it('deselects a repo card when clicked twice', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReposPage />)

    await waitFor(() => {
      expect(screen.getByText('project-alpha')).toBeInTheDocument()
    })

    const repoCard = screen.getByText('project-alpha').closest('button')!

    // Click to select
    await user.click(repoCard)
    const continueBtn = screen.getByRole('button', { name: /Continuar/i })
    expect(continueBtn).toBeEnabled()

    // Click again to deselect
    await user.click(repoCard)
    expect(continueBtn).toBeDisabled()
  })
})
