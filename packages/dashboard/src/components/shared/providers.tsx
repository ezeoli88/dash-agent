'use client'

import { Suspense, useEffect } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState, type ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { CreateTaskDialog } from '@/features/tasks/components/create-task-dialog'
import { CommandPalette } from '@/components/shared/command-palette'
import { NavigationProgress } from '@/components/shared/navigation-progress'
import { useRepoStore } from '@/features/repos/stores/repo-store'
import { useSecretsStatus } from '@/features/setup/hooks/use-secrets-status'
import { useSetupStore } from '@/features/setup/stores/setup-store'

/**
 * Detects server restarts (via X-Server-ID header mismatch)
 * and clears all cached state so the user re-selects a repo.
 */
function ServerRestartDetector() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const handleRestart = () => {
      queryClient.clear()
      useRepoStore.getState().reset()
      window.location.href = '/repos'
    }

    window.addEventListener('server-restart', handleRestart)
    return () => window.removeEventListener('server-restart', handleRestart)
  }, [queryClient])

  return null
}

/**
 * Syncs server secrets/connection state to the local Zustand store.
 * No redirects — just keeps the store in sync for components that need it.
 */
function StateSync({ children }: { children: ReactNode }) {
  const { data: serverStatus } = useSecretsStatus()
  const syncFromServer = useSetupStore((state) => state.syncFromServer)

  useEffect(() => {
    if (serverStatus) {
      syncFromServer(serverStatus)
    }
  }, [serverStatus, syncFromServer])

  return <>{children}</>
}

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ServerRestartDetector />
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <StateSync>
          {children}
        </StateSync>
        <CreateTaskDialog />
        <CommandPalette />
        <Toaster position="bottom-right" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
