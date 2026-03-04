'use client'

import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Header } from './header'
import { Sidebar } from './sidebar'
import { useRepoContext } from '@/features/repos/hooks/use-repo-context'
import { useLayoutStore } from '@/stores/layout-store'
import { cn } from '@/lib/utils'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter()
  const { selectedRepoId, hasRepos, isLoading } = useRepoContext()
  const isSidebarCollapsed = useLayoutStore((s) => s.isSidebarCollapsed)

  // Redirect to repo selection when no repo is selected or no repos available
  useEffect(() => {
    if (!isLoading && (!hasRepos || !selectedRepoId)) {
      router.navigate({ to: '/repos' })
    }
  }, [isLoading, hasRepos, selectedRepoId, router])

  return (
    <div className="relative flex h-screen bg-gradient-page overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <main
          id="main-content"
          tabIndex={-1}
          aria-label="Main content"
          className="flex-1 overflow-auto"
        >
          <div className="w-full py-6 px-4 md:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
