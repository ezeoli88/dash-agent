'use client'

import { FilePlus, FileEdit, FileX } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileChange, FileChangeStatus } from '../types'
import { ScrollArea } from '@/components/ui/scroll-area'

interface FileChangesProps {
  files: FileChange[]
  selectedFile: string | null
  onSelectFile: (path: string) => void
}

const statusConfig: Record<
  FileChangeStatus,
  { icon: React.ElementType; color: string; bgColor: string; label: string }
> = {
  added: {
    icon: FilePlus,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    label: 'Added',
  },
  modified: {
    icon: FileEdit,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    label: 'Modified',
  },
  deleted: {
    icon: FileX,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    label: 'Deleted',
  },
}

function getFileName(path: string): string {
  return path.split('/').pop() || path
}

function getDirectory(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.length > 0 ? parts.join('/') + '/' : ''
}

export function FileChanges({ files, selectedFile, onSelectFile }: FileChangesProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        {files.map((file) => {
          const config = statusConfig[file.status]
          const Icon = config.icon
          const isSelected = selectedFile === file.path

          return (
            <button
              key={file.path}
              onClick={() => onSelectFile(file.path)}
              className={cn(
                'w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                'hover:bg-accent/50',
                isSelected && 'bg-accent'
              )}
            >
              <Icon
                className={cn('size-4 shrink-0 mt-0.5', config.color)}
                aria-label={config.label}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm truncate" title={file.path}>
                    {getFileName(file.path)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate" title={file.path}>
                    {getDirectory(file.path)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {file.additions > 0 && (
                    <span className="text-xs font-mono text-green-600 dark:text-green-400">
                      +{file.additions}
                    </span>
                  )}
                  {file.deletions > 0 && (
                    <span className="text-xs font-mono text-red-600 dark:text-red-400">
                      -{file.deletions}
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}

/**
 * Compact version of file changes showing just icons and counts
 */
export function FileChangesSummary({ files }: { files: FileChange[] }) {
  const counts = files.reduce(
    (acc, file) => {
      acc[file.status] = (acc[file.status] || 0) + 1
      return acc
    },
    {} as Record<FileChangeStatus, number>
  )

  return (
    <div className="flex items-center gap-3 text-sm">
      {counts.added > 0 && (
        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
          <FilePlus className="size-4" />
          <span>{counts.added}</span>
        </div>
      )}
      {counts.modified > 0 && (
        <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
          <FileEdit className="size-4" />
          <span>{counts.modified}</span>
        </div>
      )}
      {counts.deleted > 0 && (
        <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
          <FileX className="size-4" />
          <span>{counts.deleted}</span>
        </div>
      )}
    </div>
  )
}
