'use client'

import { useState, useCallback } from 'react'
import { AlertTriangle, Check, FolderSearch, GitBranch, Loader2, HardDrive, ArrowRight } from 'lucide-react'
import { useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useLocalRepos, useAddLocalRepo } from '@/features/repos/hooks/use-local-repos'
import { useRepos } from '@/features/repos/hooks/use-repos'
import type { LocalRepository } from '@/features/repos/types'
import { useSecretsStatus } from '@/features/setup/hooks/use-secrets-status'

export default function ReposPage() {
  const router = useRouter()

  // Scan local repos automatically
  const { data: localReposData, isLoading: isScanning } = useLocalRepos(true)
  const { data: existingRepos } = useRepos()
  const addLocalRepo = useAddLocalRepo()

  const { data: secretsStatus } = useSecretsStatus()
  const hasGitProvider = secretsStatus?.github?.connected || secretsStatus?.gitlab?.connected

  // Multi-select state
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  const allRepos = localReposData?.repos ?? []

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

  const handleContinue = useCallback(() => {
    const reposToAdd = allRepos.filter((r) => selectedPaths.has(r.path))
    // Fire-and-forget: add repos in background, navigate immediately
    for (const repo of reposToAdd) {
      addLocalRepo.mutate({
        name: repo.name,
        path: repo.path,
        default_branch: repo.current_branch,
        remote_url: repo.remote_url,
      })
    }
    router.navigate({ to: '/board' })
  }, [allRepos, selectedPaths, addLocalRepo, router])

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

        {/* Git provider warning */}
        {secretsStatus && !hasGitProvider && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Token de GitHub o GitLab no configurado
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Para crear PRs y gestionar repositorios remotos, necesitas configurar un token de acceso personal.
              </p>
            </div>
          </div>
        )}

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

            {/* All repos */}
            {allRepos.length > 0 && (
              <div>
                <div className="grid grid-cols-4 gap-3">
                  {allRepos.map((repo) => (
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
                    disabled={selectedPaths.size === 0}
                    onClick={handleContinue}
                  >
                    Continuar
                    <ArrowRight className="size-4 ml-1.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* No repos at all */}
            {allRepos.length === 0 && (
              <div className="rounded-lg border bg-muted/50 p-6 text-center text-sm text-muted-foreground">
                No se encontraron repositorios Git en la ruta escaneada.
              </div>
            )}

            {/* Continue (for returning users who already have repos) */}
            {existingRepos && existingRepos.length > 0 && (
              <div className="flex items-center gap-3 pt-2">
                <Button onClick={() => router.navigate({ to: '/board' })} size="sm">
                  Continuar al board
                  <ArrowRight className="size-4 ml-2" />
                </Button>
              </div>
            )}
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
