import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { initializeAuth, getAuthToken } from './lib/auth'
import './app/globals.css'

// Extract and store auth token before rendering
initializeAuth()

/**
 * Pre-render check: fetch repos from the server (bypassing all caches)
 * to detect server restarts. If repos are empty, redirect to /repos
 * before React even mounts — this is the most aggressive guard.
 */
async function bootAndRender() {
  try {
    const origin = window.location.origin
    const token = getAuthToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const response = await fetch(`${origin}/api/repos`, {
      headers,
      cache: 'no-store',
    })

    // Track server ID for restart detection across API calls
    const serverId = response.headers.get('X-Server-ID')
    if (serverId) {
      const stored = localStorage.getItem('agent-board-server-id')
      localStorage.setItem('agent-board-server-id', serverId)
      if (stored && stored !== serverId) {
        // Server restarted — hard redirect before React mounts
        window.location.href = '/repos'
        return
      }
    }

    if (response.ok) {
      const repos = await response.json()
      if (!Array.isArray(repos) || repos.length === 0) {
        // No repos available — go to repo selection
        if (window.location.pathname !== '/repos' && window.location.pathname !== '/') {
          window.location.href = '/repos'
          return
        }
      }
    } else {
      // Auth failed or server error — redirect to repos
      if (window.location.pathname !== '/repos' && window.location.pathname !== '/') {
        window.location.href = '/repos'
        return
      }
    }
  } catch {
    // Network error — server might not be ready yet, continue with normal render
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

bootAndRender()
