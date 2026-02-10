'use client'

import { AlertTriangle, FileWarning, Loader2, MonitorUp, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOpenEditor } from '../hooks/use-open-editor'
import { useResolveConflicts } from '../hooks/use-resolve-conflicts'
import type { Task } from '../types'

interface MergeConflictsProps {
  task: Task
}

function parseConflictFiles(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((f): f is string => typeof f === 'string')
    }
    return []
  } catch {
    return []
  }
}

export function MergeConflicts({ task }: MergeConflictsProps) {
  const openEditor = useOpenEditor(task.id)
  const resolveConflicts = useResolveConflicts(task.id)
  const conflictFiles = parseConflictFiles(task.conflict_files)
  const targetBranch = task.target_branch || 'main'

  return (
    <Card className="border-rose-300 dark:border-rose-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-rose-700 dark:text-rose-400">
          <AlertTriangle className="h-5 w-5" />
          Merge Conflicts Detected
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Se detectaron conflictos al mergear con <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{targetBranch}</code>. Resolvelos antes de crear el PR.
        </p>

        {conflictFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Archivos con conflictos:</p>
            <div className="rounded-md border bg-muted/50 p-3 space-y-1.5">
              {conflictFiles.map((file) => (
                <div key={file} className="flex items-center gap-2 text-sm">
                  <FileWarning className="h-4 w-4 shrink-0 text-rose-500" />
                  <span className="font-mono text-xs">{file}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="outline"
            onClick={() => openEditor.mutate()}
            disabled={openEditor.isPending || resolveConflicts.isPending}
          >
            {openEditor.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MonitorUp className="h-4 w-4" />
            )}
            Abrir en VS Code
          </Button>
          <Button
            variant="default"
            onClick={() => resolveConflicts.mutate()}
            disabled={openEditor.isPending || resolveConflicts.isPending}
          >
            {resolveConflicts.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {resolveConflicts.isPending ? 'Verificando...' : 'Ya resolvi los conflictos'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
