'use client'

import { useState } from 'react'
import { Trash2, Loader2, Lightbulb, ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { LearnedPattern } from '../types'

interface LearnedPatternsListProps {
  patterns: LearnedPattern[]
  repoId: string
  onClear: () => Promise<void>
  onDelete?: (patternId: string) => Promise<void>
  isClearing?: boolean
  className?: string
}

export function LearnedPatternsList({
  patterns,
  repoId,
  onClear,
  onDelete,
  isClearing = false,
  className,
}: LearnedPatternsListProps) {
  const hasPatterns = patterns.length > 0
  const [deletingPatternId, setDeletingPatternId] = useState<string | null>(null)

  const handleDeletePattern = async (patternId: string) => {
    if (!onDelete) return

    setDeletingPatternId(patternId)
    try {
      await onDelete(patternId)
      toast.success('Pattern eliminado')
    } catch (error) {
      toast.error('Error al eliminar pattern')
      console.error('Error deleting pattern:', error)
    } finally {
      setDeletingPatternId(null)
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Patterns Aprendidos</label>
        {hasPatterns && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={isClearing}>
                {isClearing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Limpiar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpiar patterns aprendidos?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta accion eliminara todos los patterns que el agente aprendio de tu feedback.
                  El agente empezara desde cero a aprender las convenciones del proyecto.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onClear}>Limpiar patterns</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="rounded-md border">
        {!hasPatterns ? (
          <div className="p-4 text-center">
            <Lightbulb className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              No hay patterns aprendidos todavia
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              El agente aprendera de tu feedback en PRs
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {patterns.map((pattern) => (
              <li key={pattern.id} className="p-3 group hover:bg-muted/50 transition-colors">
                <div className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">-</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">&ldquo;{pattern.pattern}&rdquo;</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>Aprendido de tarea</span>
                      <a
                        href="/board"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        #{pattern.learned_from_task_id.slice(0, 8)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  {onDelete && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeletePattern(pattern.id)}
                          disabled={deletingPatternId === pattern.id}
                        >
                          {deletingPatternId === pattern.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Eliminar pattern</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Los patterns se aprenden automaticamente cuando rechazas PRs o pides cambios explicando por que.
      </p>
    </div>
  )
}
