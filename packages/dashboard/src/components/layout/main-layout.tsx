'use client'

import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Header } from './header'
import { useRepoContext } from '@/features/repos/hooks/use-repo-context'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter()
  const { selectedRepoId, hasRepos, isLoading } = useRepoContext()

  // Redirect to repo selection when no repo is selected or no repos available
  useEffect(() => {
    if (!isLoading && (!hasRepos || !selectedRepoId)) {
      router.navigate({ to: '/repos' })
    }
  }, [isLoading, hasRepos, selectedRepoId, router])

  return (
    <div className="relative min-h-screen bg-gradient-page">
      <Header />
      <main
        id="main-content"
        tabIndex={-1}
        aria-label="Main content"
      >
        <div className="w-full py-6 px-4 md:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
