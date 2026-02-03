'use client'

import { Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState, type ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TaskFormDialog } from '@/features/tasks/components/task-form-dialog'
import { CommandPalette } from '@/components/shared/command-palette'
import { NavigationProgress } from '@/components/shared/navigation-progress'

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
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
        <TaskFormDialog />
        <CommandPalette />
        <Toaster position="bottom-right" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
