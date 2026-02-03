'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Command } from 'cmdk'
import {
  Plus,
  ClipboardList,
  Moon,
  Sun,
  Search,
  Laptop,
  Settings,
  Home,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useTaskUIStore } from '@/features/tasks/stores/task-ui-store'
import { cn } from '@/lib/utils'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const router = useRouter()
  const { setTheme, theme } = useTheme()
  const { openCreateModal, setSearchQuery } = useTaskUIStore()

  // Toggle command palette with Cmd+K or Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const runCommand = useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  const handleSearchTasks = useCallback(() => {
    if (search.trim()) {
      setSearchQuery(search.trim())
      router.push('/tasks')
    }
  }, [search, setSearchQuery, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-[640px]">
        <VisuallyHidden>
          <DialogTitle>Command Palette</DialogTitle>
        </VisuallyHidden>
        <Command
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
          loop
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              placeholder="Type a command or search..."
              value={search}
              onValueChange={setSearch}
              className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {/* Quick Actions */}
            <Command.Group heading="Quick Actions">
              <CommandItem
                onSelect={() => runCommand(() => {
                  openCreateModal()
                })}
              >
                <Plus className="mr-2 h-4 w-4" />
                <span>Create New Task</span>
                <Kbd>N</Kbd>
              </CommandItem>

              {search.trim() && (
                <CommandItem onSelect={() => runCommand(handleSearchTasks)}>
                  <Search className="mr-2 h-4 w-4" />
                  <span>Search tasks for &quot;{search}&quot;</span>
                </CommandItem>
              )}
            </Command.Group>

            {/* Navigation */}
            <Command.Group heading="Navigation">
              <CommandItem onSelect={() => runCommand(() => router.push('/tasks'))}>
                <ClipboardList className="mr-2 h-4 w-4" />
                <span>Go to Tasks</span>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push('/'))}>
                <Home className="mr-2 h-4 w-4" />
                <span>Go to Home</span>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push('/settings'))}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Go to Settings</span>
              </CommandItem>
            </Command.Group>

            {/* Theme */}
            <Command.Group heading="Theme">
              <CommandItem onSelect={() => runCommand(() => setTheme('light'))}>
                <Sun className="mr-2 h-4 w-4" />
                <span>Light Mode</span>
                {theme === 'light' && <CheckMark />}
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => setTheme('dark'))}>
                <Moon className="mr-2 h-4 w-4" />
                <span>Dark Mode</span>
                {theme === 'dark' && <CheckMark />}
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => setTheme('system'))}>
                <Laptop className="mr-2 h-4 w-4" />
                <span>System Theme</span>
                {theme === 'system' && <CheckMark />}
              </CommandItem>
            </Command.Group>
          </Command.List>

          {/* Footer */}
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Navigate</span>
              <Kbd small>
                <span className="text-[10px]">Arrow</span>
              </Kbd>
              <span>Select</span>
              <Kbd small>Enter</Kbd>
              <span>Close</span>
              <Kbd small>Esc</Kbd>
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

interface CommandItemProps {
  children: React.ReactNode
  onSelect: () => void
  disabled?: boolean
}

function CommandItem({ children, onSelect, disabled }: CommandItemProps) {
  return (
    <Command.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-md px-2 py-2 text-sm outline-none',
        'hover:bg-accent hover:text-accent-foreground',
        'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        'transition-colors'
      )}
    >
      {children}
    </Command.Item>
  )
}

function Kbd({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <kbd
      className={cn(
        'ml-auto pointer-events-none inline-flex select-none items-center gap-1 rounded border bg-muted font-mono font-medium text-muted-foreground',
        small ? 'h-5 px-1.5 text-[10px]' : 'h-5 px-1.5 text-[10px]'
      )}
    >
      {children}
    </kbd>
  )
}

function CheckMark() {
  return (
    <span className="ml-auto text-primary">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  )
}
