'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Trash2, Loader2, GitBranch, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useRepoStore } from '../stores/repo-store'
import { useRepo } from '../hooks/use-repo'
import {
  useUpdateRepo,
  useDeleteRepo,
  useDetectStack,
  useClearPatterns,
} from '../hooks/use-repo-mutations'
import { useDeletePattern } from '../hooks/use-pattern-mutations'
import { ConventionsEditor } from './conventions-editor'
import { LearnedPatternsList } from './learned-patterns-list'

export function RepoConfigDialog() {
  const { isConfigDialogOpen, configRepoId, closeConfigDialog, setSelectedRepo, selectedRepoId } = useRepoStore()
  const { data: repo, isLoading } = useRepo(configRepoId)

  const updateRepo = useUpdateRepo()
  const deleteRepo = useDeleteRepo()
  const detectStack = useDetectStack()
  const clearPatterns = useClearPatterns()
  const deletePattern = useDeletePattern()

  const [defaultBranch, setDefaultBranch] = useState('')

  // Sync branch input with repo data
  useEffect(() => {
    if (repo) {
      setDefaultBranch(repo.default_branch)
    }
  }, [repo])

  const handleSaveConventions = async (conventions: string) => {
    if (!configRepoId) return
    await updateRepo.mutateAsync({ id: configRepoId, data: { conventions } })
  }

  const handleSaveBranch = async () => {
    if (!configRepoId || !defaultBranch.trim()) return
    await updateRepo.mutateAsync({
      id: configRepoId,
      data: { default_branch: defaultBranch.trim() },
    })
  }

  const handleDetectStack = async () => {
    if (!configRepoId) return
    await detectStack.mutateAsync(configRepoId)
  }

  const handleClearPatterns = async () => {
    if (!configRepoId) return
    await clearPatterns.mutateAsync(configRepoId)
  }

  const handleDeletePattern = async (patternId: string) => {
    if (!configRepoId) return
    await deletePattern.mutateAsync({ repoId: configRepoId, patternId })
  }

  const handleDelete = async () => {
    if (!configRepoId) return
    await deleteRepo.mutateAsync(configRepoId)
    // Clear selection if we deleted the selected repo
    if (selectedRepoId === configRepoId) {
      setSelectedRepo(null)
    }
    closeConfigDialog()
  }

  const handleClose = () => {
    closeConfigDialog()
  }

  if (!configRepoId) return null

  return (
    <Dialog open={isConfigDialogOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {repo?.name ?? 'Cargando...'} &gt; Configuracion
          </DialogTitle>
          <DialogDescription>
            Configura el stack detectado, convenciones y patterns aprendidos.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !repo ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Stack Detection Section */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Left: Detected Stack */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Stack Detectado</label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDetectStack}
                    disabled={detectStack.isPending}
                  >
                    {detectStack.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Re-detectar
                  </Button>
                </div>
                <div className="rounded-md border p-4 space-y-2">
                  <StackItem
                    label="Framework"
                    value={repo.detected_stack.framework}
                  />
                  <StackItem
                    label="State"
                    value={repo.detected_stack.state_management}
                  />
                  <StackItem
                    label="Styling"
                    value={repo.detected_stack.styling}
                  />
                  <StackItem
                    label="Testing"
                    value={repo.detected_stack.testing}
                  />
                </div>
              </div>

              {/* Right: Conventions Editor */}
              <ConventionsEditor
                value={repo.conventions}
                onSave={handleSaveConventions}
                isSaving={updateRepo.isPending}
              />
            </div>

            <Separator />

            {/* Learned Patterns */}
            <LearnedPatternsList
              patterns={repo.learned_patterns}
              repoId={repo.id}
              onClear={handleClearPatterns}
              onDelete={handleDeletePattern}
              isClearing={clearPatterns.isPending}
            />

            <Separator />

            {/* Branch Settings */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Branch por defecto</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={defaultBranch}
                    onChange={(e) => setDefaultBranch(e.target.value)}
                    placeholder="main"
                    className="pl-9"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={handleSaveBranch}
                  disabled={
                    updateRepo.isPending ||
                    !defaultBranch.trim() ||
                    defaultBranch === repo.default_branch
                  }
                >
                  {updateRepo.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Guardar'
                  )}
                </Button>
              </div>
            </div>

            {/* Error messages */}
            {(updateRepo.isError || detectStack.isError || clearPatterns.isError || deletePattern.isError) && (
              <div className="rounded-md bg-destructive/10 border border-destructive/50 p-3">
                <p className="text-sm text-destructive">
                  {updateRepo.isError && `Error al actualizar: ${(updateRepo.error as Error).message}`}
                  {detectStack.isError && `Error al detectar stack: ${(detectStack.error as Error).message}`}
                  {clearPatterns.isError && `Error al limpiar patterns: ${(clearPatterns.error as Error).message}`}
                  {deletePattern.isError && `Error al eliminar pattern: ${(deletePattern.error as Error).message}`}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="sm:mr-auto" disabled={deleteRepo.isPending}>
                {deleteRepo.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Eliminar Repositorio
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Eliminar repositorio?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Esta accion no se puede deshacer. El repositorio <strong>{repo?.name}</strong> sera
                  eliminado junto con todas sus convenciones y patterns aprendidos.
                  Las tareas asociadas no seran eliminadas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDelete}
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button variant="outline" onClick={handleClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Stack item display component
 */
function StackItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <span className={value ? 'font-medium' : 'text-muted-foreground'}>
        {value ?? 'No detectado'}
      </span>
    </div>
  )
}
