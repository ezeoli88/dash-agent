'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSecretsStatus } from '../hooks/use-secrets-status'
import { useSetupStore } from '../stores/setup-store'

interface SetupGuardProps {
  children: ReactNode
}

/**
 * Guard component that:
 * 1. Fetches secrets status from server on mount
 * 2. Syncs server state to local store
 * 3. Redirects based on setup completion status
 *
 * This ensures the frontend state matches server state even after page refresh.
 *
 * Scenarios:
 * - If setup is NOT complete and user is NOT on /setup/* -> redirect to /setup
 * - If setup IS complete and user IS on /setup (not callback) -> redirect to /tasks
 * - Otherwise -> render children
 */
export function SetupGuard({ children }: SetupGuardProps) {
  const router = useRouter()
  const pathname = usePathname()

  // Fetch secrets status from server
  const { data: serverStatus, isLoading, isError } = useSecretsStatus()

  // Get store actions
  const syncFromServer = useSetupStore((state) => state.syncFromServer)
  const localIsComplete = useSetupStore((state) => state.isSetupComplete())

  // Sync server state to local store when data arrives
  useEffect(() => {
    if (serverStatus) {
      syncFromServer(serverStatus)
    }
  }, [serverStatus, syncFromServer])

  // Handle redirects after server sync
  useEffect(() => {
    // Wait for server status to load
    if (isLoading) return

    // Use server status if available, otherwise fall back to local
    const isComplete = serverStatus?.isComplete ?? localIsComplete

    const isSetupPage = pathname?.startsWith('/setup')
    const isCallbackPage = pathname?.includes('/callback')

    // Don't redirect from callback pages - they need to complete their flow
    if (isCallbackPage) return

    if (!isComplete && !isSetupPage) {
      // User needs to complete setup
      router.replace('/setup')
    } else if (isComplete && isSetupPage) {
      // Setup complete, redirect to dashboard
      router.replace('/tasks')
    }
  }, [serverStatus, localIsComplete, pathname, router, isLoading])

  // Show loading while fetching server status
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    )
  }

  // If server fetch failed, use local state and continue
  // This allows the app to work even if server is temporarily unavailable
  if (isError) {
    console.warn('Failed to fetch secrets status from server, using local state')
  }

  return <>{children}</>
}
