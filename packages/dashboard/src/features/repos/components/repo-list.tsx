'use client'

import { Plus } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useRepos } from '../hooks/use-repos'
import { useRepoStore } from '../stores/repo-store'
import { RepoCard } from './repo-card'

interface RepoListProps {
  compact?: boolean
}

export function RepoList({ compact = false }: RepoListProps) {
  const { data: repos, isLoading, error } = useRepos()
  const {
    selectedRepoId,
    setSelectedRepo,
    openAddDialog,
    openConfigDialog,
  } = useRepoStore()

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-3">
            <div className="flex items-start gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                {!compact && <Skeleton className="h-3 w-1/2" />}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          Error al cargar repositorios: {error.message}
        </p>
      </div>
    )
  }

  if (!repos || repos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          No tienes repositorios agregados
        </p>
        <Button variant="outline" size="sm" onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Agregar repositorio
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {repos.map((repo) => (
        <RepoCard
          key={repo.id}
          repo={repo}
          isSelected={repo.id === selectedRepoId}
          compact={compact}
          onSelect={() => setSelectedRepo(repo)}
          onConfigure={() => openConfigDialog(repo.id)}
        />
      ))}
      {!compact && (
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={openAddDialog}
        >
          <Plus className="h-4 w-4 mr-2" />
          Agregar repositorio
        </Button>
      )}
    </div>
  )
}
