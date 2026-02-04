'use client'

import { useState, useMemo } from 'react'
import { Search, Globe, Check, Loader2, Lock, Star, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useRepoStore } from '../stores/repo-store'
import { useGitHubRepos } from '../hooks/use-github-repos'
import { useCreateRepo, useValidateRepoUrl } from '../hooks/use-repo-mutations'
import { useRepos } from '../hooks/use-repos'
import type { GitHubRepository } from '../types'

export function AddRepoDialog() {
  const { isAddDialogOpen, closeAddDialog } = useRepoStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGitHubRepo, setSelectedGitHubRepo] = useState<GitHubRepository | null>(null)
  const [customUrl, setCustomUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)

  const { data: githubData, isLoading: isLoadingGitHub } = useGitHubRepos(searchQuery)
  const { data: existingRepos } = useRepos()
  const createRepo = useCreateRepo()
  const validateUrl = useValidateRepoUrl()

  // Filter out repos that are already added
  const existingUrls = useMemo(() => {
    return new Set(existingRepos?.map((r) => r.url) ?? [])
  }, [existingRepos])

  const availableRepos = useMemo(() => {
    if (!githubData?.repos) return []
    return githubData.repos.filter((r: GitHubRepository) => !existingUrls.has(r.html_url))
  }, [githubData?.repos, existingUrls])

  const alreadyAddedRepos = useMemo(() => {
    if (!githubData?.repos) return []
    return githubData.repos.filter((r: GitHubRepository) => existingUrls.has(r.html_url))
  }, [githubData?.repos, existingUrls])

  const handleSelectGitHubRepo = (repo: GitHubRepository) => {
    setSelectedGitHubRepo(repo)
    setCustomUrl('')
    setUrlError(null)
  }

  const handleCustomUrlChange = (url: string) => {
    setCustomUrl(url)
    setSelectedGitHubRepo(null)
    setUrlError(null)
  }

  const handleAddRepo = async () => {
    if (selectedGitHubRepo) {
      // Add from selected GitHub repo
      createRepo.mutate(
        {
          name: selectedGitHubRepo.full_name,
          url: selectedGitHubRepo.html_url,
          default_branch: selectedGitHubRepo.default_branch,
        },
        {
          onSuccess: () => {
            closeAddDialog()
            resetState()
          },
        }
      )
    } else if (customUrl.trim()) {
      // Validate and add from URL
      const result = await validateUrl.mutateAsync(customUrl.trim())
      if (result.valid && result.repo) {
        createRepo.mutate(
          {
            name: result.repo.full_name,
            url: customUrl.trim(),
            default_branch: result.repo.default_branch,
          },
          {
            onSuccess: () => {
              closeAddDialog()
              resetState()
            },
          }
        )
      } else {
        setUrlError(result.error ?? 'URL invalida')
      }
    }
  }

  const resetState = () => {
    setSearchQuery('')
    setSelectedGitHubRepo(null)
    setCustomUrl('')
    setUrlError(null)
  }

  const handleClose = () => {
    closeAddDialog()
    resetState()
  }

  const isAdding = createRepo.isPending || validateUrl.isPending
  const canAdd = (selectedGitHubRepo !== null || customUrl.trim().length > 0) && !isAdding

  return (
    <Dialog open={isAddDialogOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Agregar Repositorio</DialogTitle>
          <DialogDescription>
            Selecciona un repositorio de tu cuenta de GitHub o pega una URL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar repositorios..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* GitHub repos list */}
          <div className="rounded-md border">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
              Tus repositorios de GitHub
            </div>
            <ScrollArea className="h-[200px]">
              {isLoadingGitHub ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : availableRepos.length === 0 && alreadyAddedRepos.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  No se encontraron repositorios
                </div>
              ) : (
                <div className="divide-y">
                  {availableRepos.map((repo: GitHubRepository) => (
                    <button
                      key={repo.id}
                      type="button"
                      className={cn(
                        'w-full px-3 py-2 text-left hover:bg-accent transition-colors flex items-center justify-between gap-2',
                        selectedGitHubRepo?.id === repo.id && 'bg-accent'
                      )}
                      onClick={() => handleSelectGitHubRepo(repo)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{repo.full_name}</span>
                          {repo.private && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                        </div>
                        {repo.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {repo.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {repo.language && <span>{repo.language}</span>}
                          {repo.stargazers_count > 0 && (
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              {repo.stargazers_count}
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedGitHubRepo?.id === repo.id && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                  {alreadyAddedRepos.length > 0 && (
                    <>
                      <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30">
                        Ya agregados
                      </div>
                      {alreadyAddedRepos.map((repo: GitHubRepository) => (
                        <div
                          key={repo.id}
                          className="w-full px-3 py-2 text-left opacity-50 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{repo.full_name}</span>
                              {repo.private && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                            </div>
                          </div>
                          <Check className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Separator */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                o pega una URL
              </span>
            </div>
          </div>

          {/* Custom URL input */}
          <div className="space-y-2">
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="https://github.com/usuario/repo"
                value={customUrl}
                onChange={(e) => handleCustomUrlChange(e.target.value)}
                className={cn('pl-9', urlError && 'border-destructive')}
              />
            </div>
            {urlError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{urlError}</span>
              </div>
            )}
          </div>

          {/* Error message */}
          {createRepo.isError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/50 p-3">
              <p className="text-sm text-destructive">
                Error al agregar repositorio: {(createRepo.error as Error).message}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isAdding}>
            Cancelar
          </Button>
          <Button onClick={handleAddRepo} disabled={!canAdd}>
            {isAdding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Agregar Repositorio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
