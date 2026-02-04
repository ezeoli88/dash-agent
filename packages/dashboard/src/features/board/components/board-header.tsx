'use client'

import { Plus, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTaskUIStore } from '@/features/tasks/stores/task-ui-store'
import { useRepos } from '@/features/repos/hooks/use-repos'
import type { Repository } from '@/features/repos/types'

interface BoardHeaderProps {
  selectedRepoId?: string
  onRepoChange: (repoId: string | undefined) => void
}

/**
 * Header component for the board view.
 * Contains the board title, repository filter, and new task button.
 */
export function BoardHeader({ selectedRepoId, onRepoChange }: BoardHeaderProps) {
  const openCreateModal = useTaskUIStore((state) => state.openCreateModal)
  const { data: repos, isLoading: reposLoading } = useRepos()

  const selectedRepo = repos?.find((r) => r.id === selectedRepoId)

  const handleRepoChange = (value: string) => {
    if (value === 'all') {
      onRepoChange(undefined)
    } else {
      onRepoChange(value)
    }
  }

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <LayoutGrid className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Board</h1>
          {selectedRepo && (
            <p className="text-sm text-muted-foreground">{selectedRepo.name}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Repository Filter */}
        <Select
          value={selectedRepoId ?? 'all'}
          onValueChange={handleRepoChange}
          disabled={reposLoading}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All repositories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All repositories</SelectItem>
            {repos?.map((repo) => (
              <SelectItem key={repo.id} value={repo.id}>
                {repo.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* New Task Button */}
        <Button onClick={openCreateModal} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Task</span>
        </Button>
      </div>
    </header>
  )
}
