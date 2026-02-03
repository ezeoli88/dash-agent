'use client'

import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function useIsMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useIsMounted()

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9">
        <span className="h-5 w-5" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label={`Current theme: ${theme}. Click to change theme.`}
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" aria-hidden="true" />
          ) : theme === 'light' ? (
            <Moon className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Monitor className="h-5 w-5" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="Theme options">
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          aria-current={theme === 'light' ? 'true' : undefined}
        >
          <Sun className="mr-2 h-4 w-4" aria-hidden="true" />
          Light
          {theme === 'light' && <span className="ml-auto text-primary">Active</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          aria-current={theme === 'dark' ? 'true' : undefined}
        >
          <Moon className="mr-2 h-4 w-4" aria-hidden="true" />
          Dark
          {theme === 'dark' && <span className="ml-auto text-primary">Active</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          aria-current={theme === 'system' ? 'true' : undefined}
        >
          <Monitor className="mr-2 h-4 w-4" aria-hidden="true" />
          System
          {theme === 'system' && <span className="ml-auto text-primary">Active</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
