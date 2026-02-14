import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw-server'
import { apiClient, ApiClientError } from '../api-client'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  getAuthToken: vi.fn(() => null),
  initializeAuth: vi.fn(),
}))

// Import the mock so we can change its return value per-test
import { getAuthToken } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clears localStorage keys used by api-client between tests. */
function clearApiClientStorage() {
  localStorage.removeItem('agent-board-server-id')
  localStorage.removeItem('dash-agent-setup-config')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('apiClient', () => {
  beforeEach(() => {
    clearApiClientStorage()
    vi.clearAllMocks()
  })

  afterEach(() => {
    clearApiClientStorage()
  })

  // ========================================================================
  // Successful requests
  // ========================================================================

  it('performs a successful GET request and returns parsed JSON', async () => {
    server.use(
      http.get('*/api/test-endpoint', () => {
        return HttpResponse.json({ data: 'hello' })
      }),
    )

    const result = await apiClient.get<{ data: string }>('/test-endpoint')
    expect(result).toEqual({ data: 'hello' })
  })

  it('performs a successful POST request with body and returns parsed JSON', async () => {
    server.use(
      http.post('*/api/test-post', async ({ request }) => {
        const body = await request.json() as { name: string }
        return HttpResponse.json({ id: '1', name: body.name })
      }),
    )

    const result = await apiClient.post<{ id: string; name: string }>(
      '/test-post',
      { name: 'Test' },
    )
    expect(result).toEqual({ id: '1', name: 'Test' })
  })

  it('handles 204 No Content and returns undefined', async () => {
    server.use(
      http.delete('*/api/test-delete', () => {
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const result = await apiClient.delete('/test-delete')
    expect(result).toBeUndefined()
  })

  // ========================================================================
  // Error responses
  // ========================================================================

  it('throws ApiClientError with statusCode 400 on Bad Request', async () => {
    server.use(
      http.post('*/api/test-400', () => {
        return HttpResponse.json(
          { error: 'Bad Request', message: 'Invalid input' },
          { status: 400 },
        )
      }),
    )

    await expect(apiClient.post('/test-400')).rejects.toThrow(ApiClientError)

    try {
      await apiClient.post('/test-400')
    } catch (error) {
      const e = error as ApiClientError
      expect(e.statusCode).toBe(400)
      expect(e.message).toBe('Invalid input')
    }
  })

  it('throws ApiClientError with statusCode 401 on Unauthorized', async () => {
    server.use(
      http.get('*/api/test-401', () => {
        return HttpResponse.json(
          { error: 'Unauthorized', message: 'Invalid token' },
          { status: 401 },
        )
      }),
    )

    try {
      await apiClient.get('/test-401')
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as ApiClientError
      expect(e).toBeInstanceOf(ApiClientError)
      expect(e.statusCode).toBe(401)
    }
  })

  it('throws ApiClientError with statusCode 404 on Not Found', async () => {
    server.use(
      http.get('*/api/test-404', () => {
        return HttpResponse.json(
          { error: 'Not Found', message: 'Resource not found' },
          { status: 404 },
        )
      }),
    )

    try {
      await apiClient.get('/test-404')
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as ApiClientError
      expect(e).toBeInstanceOf(ApiClientError)
      expect(e.statusCode).toBe(404)
      expect(e.message).toBe('Resource not found')
    }
  })

  it('throws ApiClientError with code field on 409 Conflict', async () => {
    server.use(
      http.post('*/api/test-409', () => {
        return HttpResponse.json(
          { error: 'Conflict', message: 'Already exists', code: 'DUPLICATE' },
          { status: 409 },
        )
      }),
    )

    try {
      await apiClient.post('/test-409')
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as ApiClientError
      expect(e).toBeInstanceOf(ApiClientError)
      expect(e.statusCode).toBe(409)
      expect(e.code).toBe('DUPLICATE')
    }
  })

  it('throws ApiClientError with statusCode 500 on Internal Server Error', async () => {
    server.use(
      http.get('*/api/test-500', () => {
        return HttpResponse.json(
          { error: 'Internal Server Error', message: 'Something broke' },
          { status: 500 },
        )
      }),
    )

    try {
      await apiClient.get('/test-500')
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as ApiClientError
      expect(e).toBeInstanceOf(ApiClientError)
      expect(e.statusCode).toBe(500)
    }
  })

  it('throws ApiClientError with generic message for non-JSON error response', async () => {
    server.use(
      http.get('*/api/test-html-error', () => {
        return new HttpResponse('<html>Error</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        })
      }),
    )

    try {
      await apiClient.get('/test-html-error')
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as ApiClientError
      expect(e).toBeInstanceOf(ApiClientError)
      expect(e.statusCode).toBe(502)
      // Should fall back to HTTP status text when JSON parsing fails
      expect(e.message).toContain('502')
    }
  })

  it('throws ApiClientError with statusCode 0 on network error', async () => {
    server.use(
      http.get('*/api/test-network-error', () => {
        return HttpResponse.error()
      }),
    )

    try {
      await apiClient.get('/test-network-error')
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as ApiClientError
      expect(e).toBeInstanceOf(ApiClientError)
      expect(e.statusCode).toBe(0)
    }
  })

  // ========================================================================
  // Error details parsing
  // ========================================================================

  it('parses error details from response body (field -> messages mapping)', async () => {
    server.use(
      http.post('*/api/test-validation', () => {
        return HttpResponse.json(
          {
            error: 'Validation Error',
            message: 'Input validation failed',
            details: [
              { field: 'title', message: 'Title is required' },
              { field: 'title', message: 'Title must be at least 3 characters' },
              { field: 'description', message: 'Description is required' },
            ],
          },
          { status: 400 },
        )
      }),
    )

    try {
      await apiClient.post('/test-validation')
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as ApiClientError
      expect(e).toBeInstanceOf(ApiClientError)
      expect(e.details).toBeDefined()
      expect(e.details!['title']).toEqual([
        'Title is required',
        'Title must be at least 3 characters',
      ])
      expect(e.details!['description']).toEqual(['Description is required'])
    }
  })

  // ========================================================================
  // Server restart detection
  // ========================================================================

  it('stores server ID on first request without dispatching event', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    server.use(
      http.get('*/api/test-first-request', () => {
        return HttpResponse.json(
          { ok: true },
          { headers: { 'X-Server-ID': 'server-abc-123' } },
        )
      }),
    )

    await apiClient.get('/test-first-request')

    expect(localStorage.getItem('agent-board-server-id')).toBe('server-abc-123')
    // No server-restart event should be dispatched on first request
    const restartEvents = dispatchSpy.mock.calls.filter(
      call => (call[0] as Event).type === 'server-restart',
    )
    expect(restartEvents).toHaveLength(0)

    dispatchSpy.mockRestore()
  })

  it('dispatches server-restart event when X-Server-ID changes', async () => {
    // Simulate a previously stored server ID
    localStorage.setItem('agent-board-server-id', 'server-old-id')

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    server.use(
      http.get('*/api/test-restart', () => {
        return HttpResponse.json(
          { ok: true },
          { headers: { 'X-Server-ID': 'server-new-id' } },
        )
      }),
    )

    await apiClient.get('/test-restart')

    expect(localStorage.getItem('agent-board-server-id')).toBe('server-new-id')

    const restartEvents = dispatchSpy.mock.calls.filter(
      call => (call[0] as Event).type === 'server-restart',
    )
    expect(restartEvents).toHaveLength(1)

    dispatchSpy.mockRestore()
  })

  it('does not dispatch event when X-Server-ID is the same', async () => {
    localStorage.setItem('agent-board-server-id', 'server-same-id')

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    server.use(
      http.get('*/api/test-same-server', () => {
        return HttpResponse.json(
          { ok: true },
          { headers: { 'X-Server-ID': 'server-same-id' } },
        )
      }),
    )

    await apiClient.get('/test-same-server')

    const restartEvents = dispatchSpy.mock.calls.filter(
      call => (call[0] as Event).type === 'server-restart',
    )
    expect(restartEvents).toHaveLength(0)

    dispatchSpy.mockRestore()
  })

  // ========================================================================
  // Authorization header
  // ========================================================================

  it('sends Authorization header when auth token exists', async () => {
    let capturedHeaders: Headers | null = null

    server.use(
      http.get('*/api/test-auth', ({ request }) => {
        capturedHeaders = new Headers(request.headers)
        return HttpResponse.json({ ok: true })
      }),
    )

    // Set the mock to return a token
    vi.mocked(getAuthToken).mockReturnValue('my-secret-token')

    await apiClient.get('/test-auth')

    expect(capturedHeaders).not.toBeNull()
    expect(capturedHeaders!.get('authorization')).toBe('Bearer my-secret-token')
  })

  it('does not send Authorization header when no auth token', async () => {
    let capturedHeaders: Headers | null = null

    server.use(
      http.get('*/api/test-no-auth', ({ request }) => {
        capturedHeaders = new Headers(request.headers)
        return HttpResponse.json({ ok: true })
      }),
    )

    vi.mocked(getAuthToken).mockReturnValue(null)

    await apiClient.get('/test-no-auth')

    expect(capturedHeaders).not.toBeNull()
    expect(capturedHeaders!.get('authorization')).toBeNull()
  })

  // ========================================================================
  // Query params
  // ========================================================================

  it('appends query params to URL correctly', async () => {
    let capturedUrl = ''

    server.use(
      http.get('*/api/test-params', ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({ ok: true })
      }),
    )

    await apiClient.get('/test-params', {
      params: { status: 'active', search: 'hello', page: 1 },
    })

    const url = new URL(capturedUrl)
    expect(url.searchParams.get('status')).toBe('active')
    expect(url.searchParams.get('search')).toBe('hello')
    expect(url.searchParams.get('page')).toBe('1')
  })

  it('omits undefined query params', async () => {
    let capturedUrl = ''

    server.use(
      http.get('*/api/test-params-undef', ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({ ok: true })
      }),
    )

    await apiClient.get('/test-params-undef', {
      params: { status: 'active', search: undefined },
    })

    const url = new URL(capturedUrl)
    expect(url.searchParams.get('status')).toBe('active')
    expect(url.searchParams.has('search')).toBe(false)
  })

  // ========================================================================
  // PUT and PATCH methods
  // ========================================================================

  it('performs a successful PUT request', async () => {
    server.use(
      http.put('*/api/test-put', async ({ request }) => {
        const body = await request.json() as { name: string }
        return HttpResponse.json({ updated: true, name: body.name })
      }),
    )

    const result = await apiClient.put<{ updated: boolean; name: string }>(
      '/test-put',
      { name: 'Updated' },
    )
    expect(result).toEqual({ updated: true, name: 'Updated' })
  })

  it('performs a successful PATCH request', async () => {
    server.use(
      http.patch('*/api/test-patch', async ({ request }) => {
        const body = await request.json() as { title: string }
        return HttpResponse.json({ id: '1', title: body.title })
      }),
    )

    const result = await apiClient.patch<{ id: string; title: string }>(
      '/test-patch',
      { title: 'Patched' },
    )
    expect(result).toEqual({ id: '1', title: 'Patched' })
  })
})
