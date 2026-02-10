'use client'

import { Header } from './header'
import { useRepoContext } from '@/features/repos/hooks/use-repo-context'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  // Hydrate selected repo from persisted ID on app load
  useRepoContext()

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
