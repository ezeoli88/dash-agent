'use client'

import { LayoutGrid } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRepos } from '@/features/repos/hooks/use-repos'

interface BoardHeaderProps {
  selectedRepoId?: string
  onRepoChange: (repoId: string | undefined) => void
}

/**
 * Header component for the board view.
 * Contains the board title and repository filter.
 */
export function BoardHeader({ selectedRepoId, onRepoChange }: BoardHeaderProps) {
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
    </header>
  )
}
