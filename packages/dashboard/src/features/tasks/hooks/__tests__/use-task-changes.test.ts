import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw-server'
import { useTaskChanges } from '../use-task-changes'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// The api-client uses getAuthToken; mock it to avoid sessionStorage issues
vi.mock('@/lib/auth', () => ({
  getAuthToken: vi.fn(() => null),
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
// Mock data
// ---------------------------------------------------------------------------

const mockChangesResponse = {
  files: [
    {
      path: 'src/index.ts',
      status: 'modified' as const,
      additions: 10,
      deletions: 2,
      oldContent: 'const x = 1;',
      newContent: 'const x = 2;\nimport { foo } from "bar";',
    },
  ],
  diff: '@@ -1 +1,2 @@\n-const x = 1;\n+const x = 2;\n+import { foo } from "bar";',
  summary: {
    totalAdditions: 10,
    totalDeletions: 2,
    filesChanged: 1,
  },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTaskChanges', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createTestQueryClient()
  })

  it('fetches changes successfully', async () => {
    server.use(
      http.get('*/api/tasks/task-1/changes', () => {
        return HttpResponse.json(mockChangesResponse)
      }),
    )

    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskChanges('task-1'),
      { wrapper },
    )

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockChangesResponse)
    expect(result.current.data?.files).toHaveLength(1)
    expect(result.current.data?.files[0].path).toBe('src/index.ts')
  })

  it('returns loading state initially', () => {
    server.use(
      http.get('*/api/tasks/task-2/changes', () => {
        // Delay response to test loading state
        return new Promise(() => {
          // Never resolves; we just care about the initial state
        })
      }),
    )

    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskChanges('task-2'),
      { wrapper },
    )

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('handles 404 error', async () => {
    server.use(
      http.get('*/api/tasks/task-404/changes', () => {
        return HttpResponse.json(
          { error: 'Not found', message: 'Task not found' },
          { status: 404 },
        )
      }),
    )

    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskChanges('task-404'),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toBeDefined()
  })

  it('handles 500 error', async () => {
    server.use(
      http.get('*/api/tasks/task-500/changes', () => {
        return HttpResponse.json(
          { error: 'Internal server error', message: 'Server crashed' },
          { status: 500 },
        )
      }),
    )

    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskChanges('task-500'),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toBeDefined()
  })

  it('is disabled when taskId is empty', () => {
    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(
      () => useTaskChanges(''),
      { wrapper },
    )

    // Should not be loading or fetching with an empty taskId
    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })
})
