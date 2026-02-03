'use client'

import { useState, useMemo } from 'react'
import { AlertCircle, FileCode } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTaskChanges } from '../hooks/use-task-changes'
import { FileChanges } from './file-changes'
import { DiffViewer } from './diff-viewer'
import { DiffStats } from './diff-stats'
import type { FileChange } from '../types'

interface TaskDiffProps {
  taskId: string
}

export function TaskDiff({ taskId }: TaskDiffProps) {
  const { data, isLoading, isError, error } = useTaskChanges(taskId)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  // Compute effective selected file - default to first file if none selected
  const effectiveSelectedFile = useMemo(() => {
    if (selectedFile) return selectedFile
    if (data?.files && data.files.length > 0) return data.files[0].path
    return null
  }, [selectedFile, data?.files])

  // Get the currently selected file data
  const currentFile: FileChange | null =
    data?.files.find((f) => f.path === effectiveSelectedFile) || null

  if (isLoading) {
    return <TaskDiffSkeleton />
  }

  if (isError) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="size-12 text-destructive mb-4" />
          <p className="text-lg font-medium text-destructive">Failed to load changes</p>
          <p className="text-sm text-muted-foreground mt-1">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.files.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileCode className="size-12 text-muted-foreground mb-4 opacity-50" />
          <p className="text-lg font-medium">No changes found</p>
          <p className="text-sm text-muted-foreground mt-1">
            This task has not made any code changes yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Compute summary from files if not provided
  const summary = data.summary ?? {
    totalAdditions: data.files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: data.files.reduce((sum, f) => sum + f.deletions, 0),
    filesChanged: data.files.length,
  }

  return (
    <div className="space-y-4">
      {/* Stats header */}
      <Card>
        <CardContent className="py-3">
          <DiffStats
            additions={summary.totalAdditions}
            deletions={summary.totalDeletions}
            filesChanged={summary.filesChanged}
          />
        </CardContent>
      </Card>

      {/* Main diff view */}
      <Card className="overflow-hidden">
        <div className="flex flex-col lg:flex-row h-[600px]">
          {/* File list sidebar */}
          <div className="w-full lg:w-64 xl:w-72 border-b lg:border-b-0 lg:border-r flex-shrink-0 h-40 lg:h-full">
            <div className="px-3 py-2 border-b bg-muted/30">
              <h3 className="text-sm font-medium">Changed Files</h3>
              <p className="text-xs text-muted-foreground">
                {data.files.length} {data.files.length === 1 ? 'file' : 'files'}
              </p>
            </div>
            <div className="h-[calc(100%-52px)]">
              <FileChanges
                files={data.files}
                selectedFile={effectiveSelectedFile}
                onSelectFile={setSelectedFile}
              />
            </div>
          </div>

          {/* Diff viewer */}
          <div className="flex-1 min-w-0 h-[calc(100%-160px)] lg:h-full">
            <DiffViewer file={currentFile} />
          </div>
        </div>
      </Card>
    </div>
  )
}

// Pre-defined widths for skeleton lines to avoid Math.random() during render
const SKELETON_LINE_WIDTHS = ['60%', '45%', '75%', '50%', '80%', '40%', '70%', '55%', '65%', '35%', '72%', '48%', '68%', '42%', '78%']

/**
 * Skeleton loader for TaskDiff
 */
export function TaskDiffSkeleton() {
  return (
    <div className="space-y-4">
      {/* Stats header skeleton */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-2 w-24" />
            <Skeleton className="h-5 w-32" />
          </div>
        </CardContent>
      </Card>

      {/* Main diff view skeleton */}
      <Card className="overflow-hidden">
        <div className="flex flex-col lg:flex-row h-[600px]">
          {/* File list skeleton */}
          <div className="w-full lg:w-64 xl:w-72 border-b lg:border-b-0 lg:border-r flex-shrink-0 h-40 lg:h-full">
            <div className="px-3 py-2 border-b bg-muted/30">
              <Skeleton className="h-4 w-24 mb-1" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="p-2 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-2 px-2 py-1.5">
                  <Skeleton className="size-4 shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-1" />
                    <Skeleton className="h-3 w-24 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Diff viewer skeleton */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
              <Skeleton className="h-4 w-48" />
              <div className="flex items-center gap-1">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-7 w-7" />
              </div>
            </div>
            <div className="p-4 space-y-2">
              {SKELETON_LINE_WIDTHS.map((width, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4" style={{ width }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
