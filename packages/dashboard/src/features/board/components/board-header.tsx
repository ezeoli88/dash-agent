'use client'

import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRight, FolderGit2, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRepos, useRepoStore } from '@/features/repos'

/**
 * Header component for the board view.
 * Shows the board title, the currently selected repository name,
 * and a button to navigate back to the repository selection page.
 */
export function BoardHeader() {
  const { data: repos } = useRepos()
  const selectedRepo = useRepoStore((s) => s.selectedRepo)
  const selectedRepoId = useRepoStore((s) => s.selectedRepoId)

  // Resuelve el repositorio activo con la siguiente prioridad:
  // 1. El objeto selectedRepo del store (ya cargado)
  // 2. Buscar por selectedRepoId en la lista de repos del servidor
  // 3. Fallback al primer repositorio disponible
  const repo = useMemo(() => {
    if (selectedRepo) return selectedRepo
    if (selectedRepoId && repos) {
      return repos.find((r) => r.id === selectedRepoId) ?? repos[0] ?? null
    }
    return repos?.[0] ?? null
  }, [selectedRepo, selectedRepoId, repos])

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

      <Button variant="ghost" size="sm" asChild>
        <Link to="/repos">
          <ArrowLeftRight className="h-4 w-4" />
          Cambiar repo
        </Link>
      </Button>
    </header>
  )
}
