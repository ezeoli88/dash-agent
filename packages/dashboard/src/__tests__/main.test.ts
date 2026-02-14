import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for the bootAndRender logic in main.tsx.
 *
 * Since main.tsx calls bootAndRender() at module level, we use
 * vi.resetModules() + dynamic import in each test so that the mocks
 * are evaluated fresh for every scenario.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks - these are evaluated BEFORE any module code runs
// ---------------------------------------------------------------------------

const mockRender = vi.fn()
const mockCreateRoot = vi.fn(() => ({ render: mockRender }))

vi.mock('react-dom/client', () => ({
  createRoot: mockCreateRoot,
}))

vi.mock('../router', () => ({
  router: { id: 'mock-router' },
}))

vi.mock('../lib/auth', () => ({
  initializeAuth: vi.fn(),
  getAuthToken: vi.fn(() => 'test-token'),
}))

// Avoid CSS import side effects
vi.mock('../app/globals.css', () => ({}))

// Mock react to prevent JSX rendering errors in this .ts file
vi.mock('react', () => ({
  StrictMode: 'StrictMode',
  createElement: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@tanstack/react-router', () => ({
  RouterProvider: 'RouterProvider',
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let redirectedHref: string | undefined

function setupLocationMock(pathname: string) {
  redirectedHref = undefined

  // Use a Proxy so property reads work normally, but setting href is captured
  const locationProxy = new Proxy(
    {
      pathname,
      origin: 'http://localhost:3000',
      href: `http://localhost:3000${pathname}`,
      search: '',
      hash: '',
      host: 'localhost:3000',
      hostname: 'localhost',
      port: '3000',
      protocol: 'http:',
      assign: vi.fn(),
      replace: vi.fn(),
      reload: vi.fn(),
      toString: () => `http://localhost:3000${pathname}`,
    },
    {
      set(_target, prop, value) {
        if (prop === 'href') {
          redirectedHref = value as string
          return true
        }
        return Reflect.set(_target, prop, value)
      },
      get(target, prop) {
        return Reflect.get(target, prop)
      },
    },
  )

  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: locationProxy,
  })
}

function setupFetchMock(options: {
  ok?: boolean
  status?: number
  body?: unknown
  serverId?: string | null
  throwError?: boolean
}) {
  const {
    ok = true,
    status = 200,
    body = [],
    serverId = null,
    throwError = false,
  } = options

  const fetchMock = vi.fn(() => {
    if (throwError) {
      return Promise.reject(new Error('Network error'))
    }
    return Promise.resolve({
      ok,
      status,
      headers: {
        get: (name: string) => {
          if (name === 'X-Server-ID') return serverId
          return null
        },
      },
      json: () => Promise.resolve(body),
    })
  })

  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

function setupDOMMock() {
  const mockElement = document.createElement('div')
  mockElement.id = 'root'
  vi.spyOn(document, 'getElementById').mockReturnValue(mockElement)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('main.tsx - bootAndRender', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    // Reset localStorage
    localStorage.clear()

    // Setup DOM mock
    setupDOMMock()
  })

  it('redirects to /repos when server ID changes (restart detection)', async () => {
    // Store a previous server ID in localStorage
    localStorage.setItem('agent-board-server-id', 'old-server-id')

    setupLocationMock('/board')
    setupFetchMock({
      ok: true,
      body: [{ id: 'repo-1', name: 'test-repo' }],
      serverId: 'new-server-id',
    })

    await import('../main')

    // Wait for async bootAndRender to complete
    await vi.waitFor(() => {
      expect(redirectedHref).toBe('/repos')
    })

    // createRoot should NOT have been called since we redirected
    expect(mockCreateRoot).not.toHaveBeenCalled()
  })

  it('redirects to /repos when repos array is empty', async () => {
    setupLocationMock('/board')
    setupFetchMock({
      ok: true,
      body: [],
      serverId: 'server-1',
    })

    await import('../main')

    await vi.waitFor(() => {
      expect(redirectedHref).toBe('/repos')
    })

    expect(mockCreateRoot).not.toHaveBeenCalled()
  })

  it('redirects to /repos when API returns error status', async () => {
    setupLocationMock('/board')
    setupFetchMock({
      ok: false,
      status: 401,
      body: { error: 'Unauthorized' },
      serverId: null,
    })

    await import('../main')

    await vi.waitFor(() => {
      expect(redirectedHref).toBe('/repos')
    })

    expect(mockCreateRoot).not.toHaveBeenCalled()
  })

  it('renders app normally when repos exist and server ID is unchanged', async () => {
    localStorage.setItem('agent-board-server-id', 'same-server-id')

    setupLocationMock('/board')
    setupFetchMock({
      ok: true,
      body: [{ id: 'repo-1', name: 'test-repo' }],
      serverId: 'same-server-id',
    })

    await import('../main')

    await vi.waitFor(() => {
      expect(mockCreateRoot).toHaveBeenCalled()
    })

    expect(mockRender).toHaveBeenCalled()
    expect(redirectedHref).toBeUndefined()
  })

  it('renders app normally on network error (server not ready)', async () => {
    setupLocationMock('/board')
    setupFetchMock({ throwError: true })

    await import('../main')

    await vi.waitFor(() => {
      expect(mockCreateRoot).toHaveBeenCalled()
    })

    expect(mockRender).toHaveBeenCalled()
    expect(redirectedHref).toBeUndefined()
  })

  it('does not redirect from /repos even when repos are empty', async () => {
    setupLocationMock('/repos')
    setupFetchMock({
      ok: true,
      body: [],
      serverId: 'server-1',
    })

    await import('../main')

    await vi.waitFor(() => {
      expect(mockCreateRoot).toHaveBeenCalled()
    })

    // Should not redirect because we are already on /repos
    expect(redirectedHref).toBeUndefined()
  })

  it('does not redirect from / (root) even when repos are empty', async () => {
    setupLocationMock('/')
    setupFetchMock({
      ok: true,
      body: [],
      serverId: 'server-1',
    })

    await import('../main')

    await vi.waitFor(() => {
      expect(mockCreateRoot).toHaveBeenCalled()
    })

    expect(redirectedHref).toBeUndefined()
  })

  it('stores new server ID in localStorage on first boot', async () => {
    setupLocationMock('/board')
    setupFetchMock({
      ok: true,
      body: [{ id: 'repo-1', name: 'test-repo' }],
      serverId: 'first-server-id',
    })

    await import('../main')

    await vi.waitFor(() => {
      expect(mockCreateRoot).toHaveBeenCalled()
    })

    expect(localStorage.getItem('agent-board-server-id')).toBe('first-server-id')
    expect(redirectedHref).toBeUndefined()
  })

  it('sends Authorization header when token exists', async () => {
    setupLocationMock('/board')
    const fetchMock = setupFetchMock({
      ok: true,
      body: [{ id: 'repo-1', name: 'test-repo' }],
      serverId: 'server-1',
    })

    await import('../main')

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const callArgs = fetchMock.mock.calls[0]
    const requestOptions = callArgs[1] as RequestInit
    expect((requestOptions.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token')
  })
})
