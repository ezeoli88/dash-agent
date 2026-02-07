'use client'

import { useState, useCallback } from 'react'
import { Check, FolderSearch, GitBranch, Loader2, HardDrive, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useLocalRepos, useAddLocalRepo } from '@/features/repos/hooks/use-local-repos'
import { useRepos } from '@/features/repos/hooks/use-repos'
import type { LocalRepository } from '@/features/repos/types'

export default function ReposPage() {
  const router = useRouter()

  // Scan local repos automatically
  const { data: localReposData, isLoading: isScanning } = useLocalRepos(true)
  const { data: existingRepos } = useRepos()
  const addLocalRepo = useAddLocalRepo()

  // Multi-select state
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [addingRepos, setAddingRepos] = useState(false)

  // Derive sets for filtering: match by name or by file:// url
  const existingRepoKeys = new Set(
    existingRepos?.flatMap((r) => {
      const keys = [r.name]
      if (r.url.startsWith('file://')) keys.push(r.url.replace('file://', ''))
      return keys
    }) ?? []
  )

  // Filter scanned repos: exclude already-added ones
  const isAlreadyAdded = (r: LocalRepository) =>
    existingRepoKeys.has(r.name) || existingRepoKeys.has(r.path)
  const availableRepos = localReposData?.repos.filter((r) => !isAlreadyAdded(r)) ?? []
  const alreadyAddedRepos = localReposData?.repos.filter(isAlreadyAdded) ?? []

  const toggleSelection = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleAddSelected = useCallback(async () => {
    const reposToAdd = availableRepos.filter((r) => selectedPaths.has(r.path))
    if (reposToAdd.length === 0) return

    setAddingRepos(true)
    try {
      for (const repo of reposToAdd) {
        await addLocalRepo.mutateAsync({
          name: repo.name,
          path: repo.path,
          default_branch: repo.current_branch,
          remote_url: repo.remote_url,
        })
      }
      setSelectedPaths(new Set())
    } finally {
      setAddingRepos(false)
    }
  }, [availableRepos, selectedPaths, addLocalRepo])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="mb-3 text-4xl font-bold tracking-tight">dash-agent</h1>
          <p className="text-lg text-muted-foreground">
            Selecciona tus repositorios
          </p>
        </div>

        {/* Scanning state */}
        {isScanning && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Escaneando repositorios locales...
            </span>
          </div>
        )}

        {/* Repos loaded */}
        {!isScanning && localReposData && (
          <div className="space-y-4">
            {/* Scan info */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="size-4" />
              <span>
                {localReposData.total} repositorios encontrados en{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {localReposData.scan_path}
                </code>
              </span>
            </div>

            {/* Available repos to add */}
            {availableRepos.length > 0 && (
              <div>
                <div className="grid grid-cols-4 gap-3">
                  {availableRepos.map((repo) => (
                    <RepoCard
                      key={repo.path}
                      repo={repo}
                      isSelected={selectedPaths.has(repo.path)}
                      onToggle={() => toggleSelection(repo.path)}
                    />
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <Button
                    size="sm"
                    disabled={selectedPaths.size === 0 || addingRepos}
                    onClick={handleAddSelected}
                  >
                    {addingRepos && <Loader2 className="size-4 mr-2 animate-spin" />}
                    Agregar seleccionados ({selectedPaths.size})
                  </Button>
                </div>
              </div>
            )}

            {/* Already added repos */}
            {alreadyAddedRepos.length > 0 && (
              <div>
                <p className="mb-3 text-sm font-medium text-muted-foreground">
                  Ya agregados
                </p>
                <div className="grid grid-cols-4 gap-3">
                  {alreadyAddedRepos.map((repo) => (
                    <div
                      key={repo.path}
                      className="relative rounded-lg border border-green-500/30 bg-green-500/5 p-4"
                    >
                      <Check className="absolute top-2.5 right-2.5 size-4 text-green-500" />
                      <FolderSearch className="size-5 text-muted-foreground mb-2" />
                      <p className="text-sm font-medium truncate">{repo.name}</p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <GitBranch className="size-3" />
                          {repo.current_branch}
                        </Badge>
                        {repo.language && (
                          <Badge variant="outline" className="text-xs">
                            {repo.language}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No repos at all */}
            {availableRepos.length === 0 && alreadyAddedRepos.length === 0 && (
              <div className="rounded-lg border bg-muted/50 p-6 text-center text-sm text-muted-foreground">
                No se encontraron repositorios Git en la ruta escaneada.
              </div>
            )}

            {/* Continue / Skip */}
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={() => router.replace('/board')} size="sm">
                Continuar al board
                <ArrowRight className="size-4 ml-2" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => router.replace('/board')}>
                Omitir
                <ArrowRight className="size-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Selectable repo card
 */
interface RepoCardProps {
  repo: LocalRepository
  isSelected: boolean
  onToggle: () => void
}

function RepoCard({ repo, isSelected, onToggle }: RepoCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'relative rounded-lg border-2 p-4 text-left transition-all',
        isSelected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border hover:border-muted-foreground/40 hover:bg-muted/40'
      )}
    >
      {isSelected && (
        <div className="absolute top-2.5 right-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </div>
      )}
      <FolderSearch className="size-5 text-muted-foreground mb-2" />
      <p className="text-sm font-medium truncate pr-6">{repo.name}</p>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <Badge variant="secondary" className="gap-1 text-xs">
          <GitBranch className="size-3" />
          {repo.current_branch}
        </Badge>
        {repo.language && (
          <Badge variant="outline" className="text-xs">
            {repo.language}
          </Badge>
        )}
      </div>
    </button>
  )
}
