'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, Plus, Layers, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './theme-toggle'
import { useLayoutStore } from '@/stores/layout-store'
import { useTaskUIStore } from '@/features/tasks/stores/task-ui-store'
import { cn } from '@/lib/utils'

export function Header() {
  const { setMobileNavOpen } = useLayoutStore()
  const { openCreateModal } = useTaskUIStore()
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') >= 0)
  }, [])

  // Open command palette
  const openCommandPalette = () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: isMac,
        ctrlKey: !isMac,
      })
    )
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 md:px-6">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="mr-2 h-9 w-9 lg:hidden"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Logo */}
        <div className="flex items-center">
          <Link
            className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
            href="/"
          >
            <Layers className="h-6 w-6 text-primary" aria-hidden="true" />
            <span className="font-bold text-lg hidden sm:inline-block">
              Agent Board
            </span>
          </Link>
        </div>

        {/* Desktop navigation */}
        <nav
          className="ml-6 hidden items-center gap-6 text-sm font-medium md:flex"
          aria-label="Main navigation"
        >
          <Link
            className="transition-colors hover:text-foreground/80 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md px-1"
            href="/tasks"
          >
            Tasks
          </Link>
        </nav>

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-2">
          {/* Search / Command palette button */}
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'hidden md:inline-flex items-center gap-2 text-muted-foreground',
              'hover:text-foreground transition-colors'
            )}
            onClick={openCommandPalette}
            aria-label="Open command palette"
          >
            <Search className="h-4 w-4" />
            <span className="text-xs">Search...</span>
            <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex">
              <span className="text-xs">{isMac ? '\u2318' : 'Ctrl'}</span>K
            </kbd>
          </Button>

          {/* Create task button */}
          <Button
            size="sm"
            className="hidden sm:inline-flex items-center gap-2"
            onClick={openCreateModal}
          >
            <Plus className="h-4 w-4" />
            <span>New Task</span>
          </Button>
          <Button
            size="icon"
            className="h-9 w-9 sm:hidden"
            onClick={openCreateModal}
            aria-label="Create new task"
          >
            <Plus className="h-5 w-5" />
          </Button>

          {/* Theme toggle */}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
