'use client'

import { useState, useCallback, useMemo } from 'react'
import { AlertTriangle, Check, FolderSearch, GitBranch, Loader2, HardDrive, ArrowRight } from 'lucide-react'
import { useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useLocalRepos, useAddLocalRepo } from '@/features/repos/hooks/use-local-repos'
import { useRepos } from '@/features/repos/hooks/use-repos'
import { useRepoStore } from '@/features/repos/stores/repo-store'
import { apiClient } from '@/lib/api-client'
import type { LocalRepository, Repository } from '@/features/repos/types'
import { useSecretsStatus } from '@/features/setup/hooks/use-secrets-status'

/** Normaliza backslashes a forward slashes para comparar paths en Windows */
function normalizePath(s: string): string {
  return s.replace(/\\/g, '/')
}

export default function ReposPage() {
  const router = useRouter()

  // Fetch already-registered repos from the API
  const { data: registeredRepos } = useRepos()

  // Scan local repos automatically
  const { data: localReposData, isLoading: isScanning, error: scanError } = useLocalRepos(true)
  const addLocalRepo = useAddLocalRepo()
  const { setSelectedRepo } = useRepoStore()

  const { data: secretsStatus } = useSecretsStatus()
  const hasGitProvider = secretsStatus?.github?.connected || secretsStatus?.gitlab?.connected

  // Single-select state
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const allRepos = localReposData?.repos ?? []

  // Build a set of normalized URLs for registered repos for O(1) lookup
  const registeredUrlSet = useMemo(() => {
    if (!registeredRepos?.length) return new Set<string>()
    return new Set(registeredRepos.map((r) => normalizePath(r.url)))
  }, [registeredRepos])

  /** Check if a scanned local repo is already registered */
  const isAlreadyRegistered = useCallback(
    (localPath: string): boolean => {
      return registeredUrlSet.has(normalizePath(`file://${localPath}`))
    },
    [registeredUrlSet]
  )

  /** Find the registered Repository that matches a local path */
  const findRegisteredRepo = useCallback(
    (localPath: string): Repository | undefined => {
      const normalizedTarget = normalizePath(`file://${localPath}`)
      return registeredRepos?.find((r) => normalizePath(r.url) === normalizedTarget)
    },
    [registeredRepos]
  )

  const toggleSelection = useCallback((path: string) => {
    setSelectedPath((prev) => (prev === path ? null : path))
  }, [])

  const handleContinue = useCallback(async () => {
    const repo = allRepos.find((r) => r.path === selectedPath)
    if (!repo) return

    // Si el repo ya esta registrado, seleccionarlo directamente sin POST
    const existingRepo = findRegisteredRepo(repo.path)
    if (existingRepo) {
      setSelectedRepo(existingRepo)
      router.navigate({ to: '/board' })
      return
    }

    try {
      const created = await addLocalRepo.mutateAsync({
        name: repo.name,
        path: repo.path,
        default_branch: repo.default_branch ?? repo.current_branch,
        remote_url: repo.remote_url,
      })
      setSelectedRepo(created)
      router.navigate({ to: '/board' })
    } catch {
      // Repo might already exist (409) -- fetch existing and navigate
      const repos = await apiClient.get<Repository[]>('/repos')
      const existing = repos.find(
        (r) => normalizePath(r.url) === normalizePath(`file://${repo.path}`)
      )
      if (existing) {
        setSelectedRepo(existing)
        router.navigate({ to: '/board' })
      }
    }
  }, [allRepos, selectedPath, findRegisteredRepo, addLocalRepo, setSelectedRepo, router])

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

        {/* Registered repos section -- shown even while scanning */}
        {registeredRepos && registeredRepos.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="size-4" />
              <span>{registeredRepos.length} repositorio(s) registrado(s)</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {registeredRepos.map((repo) => (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => {
                    setSelectedRepo(repo)
                    router.navigate({ to: '/board' })
                  }}
                  className="relative rounded-lg border-2 border-primary/30 bg-primary/5 p-4 text-left transition-all hover:border-primary hover:bg-primary/10"
                >
                  <FolderSearch className="size-5 text-primary mb-2" />
                  <p className="text-sm font-medium truncate">{repo.name}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <GitBranch className="size-3" />
                      {repo.default_branch}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>

            {/* Divider before scan section */}
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  o agrega otro repositorio
                </span>
              </div>
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

        {/* Scan error */}
        {scanError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
            Error al escanear repositorios: {scanError.message}
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
                      isSelected={selectedPath === repo.path}
                      isRegistered={isAlreadyRegistered(repo.path)}
                      onToggle={() => toggleSelection(repo.path)}
                    />
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <Button
                    size="sm"
                    disabled={selectedPath === null}
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
                No se encontraron repositorios en{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {localReposData?.scan_path}
                </code>
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
  isRegistered: boolean
  onToggle: () => void
}

function RepoCard({ repo, isSelected, isRegistered, onToggle }: RepoCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'relative rounded-lg border-2 p-4 text-left transition-all',
        isSelected
          ? 'border-primary bg-primary/5 shadow-sm'
          : isRegistered
            ? 'border-primary/20 bg-primary/5 opacity-75 hover:opacity-100 hover:border-primary/40'
            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/40'
      )}
    >
      {isSelected && (
        <div className="absolute top-2.5 right-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </div>
      )}
      <FolderSearch className={cn('size-5 mb-2', isRegistered ? 'text-primary' : 'text-muted-foreground')} />
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
        {isRegistered && (
          <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
            Ya agregado
          </Badge>
        )}
      </div>
    </button>
  )
}
