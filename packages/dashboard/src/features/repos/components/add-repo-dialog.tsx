'use client'

import { useState, useMemo } from 'react'
import { Search, Globe, Check, Loader2, Lock, Star, AlertCircle, FolderSearch, HardDrive, GitBranch } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useRepoStore } from '../stores/repo-store'
import { useGitHubRepos } from '../hooks/use-github-repos'
import { useCreateRepo, useValidateRepoUrl } from '../hooks/use-repo-mutations'
import { useRepos } from '../hooks/use-repos'
import { useLocalRepos, useAddLocalRepo } from '../hooks/use-local-repos'
import type { GitHubRepository, LocalRepository } from '../types'

export function AddRepoDialog() {
  const { isAddDialogOpen, closeAddDialog } = useRepoStore()
  const [activeTab, setActiveTab] = useState('local')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGitHubRepo, setSelectedGitHubRepo] = useState<GitHubRepository | null>(null)
  const [customUrl, setCustomUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [scanEnabled, setScanEnabled] = useState(false)
  const [selectedLocalRepo, setSelectedLocalRepo] = useState<LocalRepository | null>(null)

  const { data: githubData, isLoading: isLoadingGitHub } = useGitHubRepos(searchQuery)
  const { data: existingRepos } = useRepos()
  const createRepo = useCreateRepo()
  const validateUrl = useValidateRepoUrl()
  const { data: localData, isLoading: isLoadingLocal } = useLocalRepos(scanEnabled)
  const addLocalRepo = useAddLocalRepo()

  // Filter out repos that are already added
  const existingUrls = useMemo(() => {
    return new Set(existingRepos?.map((r) => r.url) ?? [])
  }, [existingRepos])

  // Also track existing repo paths for local repos
  const existingPaths = useMemo(() => {
    const paths = new Set<string>()
    existingRepos?.forEach((r) => {
      if (r.url.startsWith('file://')) {
        paths.add(r.url.replace('file://', ''))
      }
    })
    return paths
  }, [existingRepos])

  const availableRepos = useMemo(() => {
    if (!githubData?.repos) return []
    return githubData.repos.filter((r: GitHubRepository) => !existingUrls.has(r.html_url))
  }, [githubData?.repos, existingUrls])

  const alreadyAddedRepos = useMemo(() => {
    if (!githubData?.repos) return []
    return githubData.repos.filter((r: GitHubRepository) => existingUrls.has(r.html_url))
  }, [githubData?.repos, existingUrls])

  // Local repos: separate available vs already added
  const availableLocalRepos = useMemo(() => {
    if (!localData?.repos) return []
    return localData.repos.filter((r: LocalRepository) => {
      const url = r.remote_url || `file://${r.path}`
      return !existingUrls.has(url) && !existingPaths.has(r.path)
    })
  }, [localData?.repos, existingUrls, existingPaths])

  const alreadyAddedLocalRepos = useMemo(() => {
    if (!localData?.repos) return []
    return localData.repos.filter((r: LocalRepository) => {
      const url = r.remote_url || `file://${r.path}`
      return existingUrls.has(url) || existingPaths.has(r.path)
    })
  }, [localData?.repos, existingUrls, existingPaths])

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

  const handleSelectLocalRepo = (repo: LocalRepository) => {
    setSelectedLocalRepo(repo)
  }

  const handleAddRepo = async () => {
    if (activeTab === 'local' && selectedLocalRepo) {
      addLocalRepo.mutate(
        {
          name: selectedLocalRepo.name,
          path: selectedLocalRepo.path,
          default_branch: selectedLocalRepo.current_branch,
          remote_url: selectedLocalRepo.remote_url,
        },
        {
          onSuccess: () => {
            closeAddDialog()
            resetState()
          },
        }
      )
    } else if (activeTab === 'github' && selectedGitHubRepo) {
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
    } else if (activeTab === 'url' && customUrl.trim()) {
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
    setScanEnabled(false)
    setSelectedLocalRepo(null)
    setActiveTab('local')
  }

  const handleClose = () => {
    closeAddDialog()
    resetState()
  }

  const isAdding = createRepo.isPending || validateUrl.isPending || addLocalRepo.isPending
  const canAdd = (() => {
    if (isAdding) return false
    if (activeTab === 'local') return selectedLocalRepo !== null
    if (activeTab === 'github') return selectedGitHubRepo !== null
    if (activeTab === 'url') return customUrl.trim().length > 0
    return false
  })()

  return (
    <Dialog open={isAddDialogOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[600px] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Agregar Repositorio</DialogTitle>
          <DialogDescription>
            Escanea repos locales, busca en GitHub o pega una URL.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="local" className="flex-1">
              <HardDrive className="h-4 w-4 mr-1.5" />
              Local
            </TabsTrigger>
            <TabsTrigger value="github" className="flex-1">
              <Search className="h-4 w-4 mr-1.5" />
              GitHub
            </TabsTrigger>
            <TabsTrigger value="url" className="flex-1">
              <Globe className="h-4 w-4 mr-1.5" />
              URL
            </TabsTrigger>
          </TabsList>

          {/* LOCAL TAB */}
          <TabsContent value="local" className="space-y-3 mt-3">
            {!scanEnabled ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <FolderSearch className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">
                  Escanea el directorio del servidor para encontrar repositorios git
                </p>
                <Button onClick={() => setScanEnabled(true)} variant="outline">
                  <FolderSearch className="h-4 w-4 mr-2" />
                  Escanear directorio
                </Button>
              </div>
            ) : (
              <>
                {localData && (
                  <div className="text-xs text-muted-foreground px-1">
                    Escaneando: <code className="bg-muted px-1 py-0.5 rounded">{localData.scan_path}</code>
                    {' '}&mdash; {localData.total} repos encontrados
                  </div>
                )}
                <div className="rounded-md border w-full overflow-hidden">
                  <ScrollArea className="h-[240px]">
                    {isLoadingLocal ? (
                      <div className="flex items-center justify-center h-full py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Escaneando...</span>
                      </div>
                    ) : availableLocalRepos.length === 0 && alreadyAddedLocalRepos.length === 0 ? (
                      <div className="flex items-center justify-center h-full py-8 text-sm text-muted-foreground">
                        No se encontraron repositorios
                      </div>
                    ) : (
                      <div className="divide-y">
                        {availableLocalRepos.map((repo: LocalRepository) => (
                          <button
                            key={repo.path}
                            type="button"
                            className={cn(
                              'w-full px-3 py-2 text-left hover:bg-accent transition-colors flex items-center justify-between gap-2',
                              selectedLocalRepo?.path === repo.path && 'bg-accent'
                            )}
                            onClick={() => handleSelectLocalRepo(repo)}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">{repo.name}</span>
                                {repo.language && (
                                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                                    {repo.language}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <GitBranch className="h-3 w-3" />
                                  {repo.current_branch}
                                </span>
                                <span className="truncate">{repo.path}</span>
                              </div>
                            </div>
                            {selectedLocalRepo?.path === repo.path && (
                              <Check className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </button>
                        ))}
                        {alreadyAddedLocalRepos.length > 0 && (
                          <>
                            <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30">
                              Ya agregados
                            </div>
                            {alreadyAddedLocalRepos.map((repo: LocalRepository) => (
                              <div
                                key={repo.path}
                                className="w-full px-3 py-2 text-left opacity-50 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium truncate">{repo.name}</span>
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
              </>
            )}
          </TabsContent>

          {/* GITHUB TAB */}
          <TabsContent value="github" className="space-y-3 mt-3">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar repositorios..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-full"
              />
            </div>

            <div className="rounded-md border w-full overflow-hidden">
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
          </TabsContent>

          {/* URL TAB */}
          <TabsContent value="url" className="space-y-3 mt-3">
            <div className="space-y-2 w-full">
              <div className="relative w-full">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="https://github.com/usuario/repo"
                  value={customUrl}
                  onChange={(e) => handleCustomUrlChange(e.target.value)}
                  className={cn('pl-9 w-full', urlError && 'border-destructive')}
                />
              </div>
              {urlError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{urlError}</span>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Error message */}
        {(createRepo.isError || addLocalRepo.isError) && (
          <div className="rounded-md bg-destructive/10 border border-destructive/50 p-3">
            <p className="text-sm text-destructive">
              Error al agregar repositorio: {((createRepo.error || addLocalRepo.error) as Error)?.message}
            </p>
          </div>
        )}

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
