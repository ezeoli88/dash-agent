'use client'

import { useEffect } from 'react'
import { Header } from './header'
import { Sidebar } from './sidebar'
import { MobileNav } from './mobile-nav'
import { useLayoutStore } from '@/stores/layout-store'
import { cn } from '@/lib/utils'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const { isSidebarCollapsed, setSidebarCollapsed } = useLayoutStore()

  // Set sidebar collapsed by default on tablet
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      // Tablet: collapse sidebar by default
      if (width >= 768 && width < 1024) {
        setSidebarCollapsed(true)
      }
    }

    // Check on mount
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [setSidebarCollapsed])

  return (
    <div className="relative min-h-screen bg-background">
      {/* Header */}
      <Header />

      {/* Mobile navigation */}
      <MobileNav />

      {/* Main content area with sidebar */}
      <div className="flex">
        {/* Desktop sidebar - hidden on mobile */}
        <div className="hidden lg:block">
          <div className="sticky top-14 h-[calc(100vh-3.5rem)]">
            <Sidebar />
          </div>
        </div>

        {/* Main content */}
        <main
          id="main-content"
          className={cn(
            'flex-1 transition-all duration-300 ease-in-out',
            'lg:ml-0'
          )}
          tabIndex={-1}
          aria-label="Main content"
        >
          <div className="container py-6 px-4 md:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
