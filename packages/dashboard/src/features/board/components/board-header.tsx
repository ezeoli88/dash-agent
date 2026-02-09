'use client'

import { FolderGit2, LayoutGrid } from 'lucide-react'
import { useRepos } from '@/features/repos/hooks/use-repos'

/**
 * Header component for the board view.
 * Shows the board title and the current repository name.
 */
export function BoardHeader() {
  const { data: repos } = useRepos()

  const repo = repos?.[0]

  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <LayoutGrid className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Board</h1>
          {repo && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FolderGit2 className="h-3.5 w-3.5" />
              {repo.name}
            </p>
          )}
        </div>
      </div>
    </header>
  )
}
