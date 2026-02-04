'use client'

import { FolderGit2, Settings, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Repository } from '../types'

interface RepoCardProps {
  repo: Repository
  isSelected?: boolean
  compact?: boolean
  onSelect?: () => void
  onConfigure?: () => void
}

/**
 * Format detected stack as a string
 */
function formatStack(repo: Repository): string {
  const parts: string[] = []

  if (repo.detected_stack.framework) {
    parts.push(repo.detected_stack.framework)
  }
  if (repo.detected_stack.state_management) {
    parts.push(repo.detected_stack.state_management)
  }
  if (repo.detected_stack.styling) {
    parts.push(repo.detected_stack.styling)
  }

  return parts.length > 0 ? parts.join(', ') : 'Stack not detected'
}

export function RepoCard({
  repo,
  isSelected = false,
  compact = false,
  onSelect,
  onConfigure,
}: RepoCardProps) {
  return (
    <div
      className={cn(
        'group relative rounded-lg border bg-card transition-colors cursor-pointer',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-accent/50',
        compact ? 'p-2' : 'p-4'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <FolderGit2
            className={cn(
              'shrink-0 mt-0.5',
              compact ? 'h-4 w-4' : 'h-5 w-5',
              isSelected ? 'text-primary' : 'text-muted-foreground'
            )}
          />
          <div className="min-w-0 flex-1">
            <h3
              className={cn(
                'font-medium truncate',
                compact ? 'text-sm' : 'text-base'
              )}
              title={repo.name}
            >
              {repo.name}
            </h3>
            {!compact && (
              <>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5" />
                  <span>{repo.default_branch}</span>
                  <span className="text-muted-foreground/50">|</span>
                  <span className="truncate">{formatStack(repo)}</span>
                </div>
                {repo.active_tasks_count > 0 && (
                  <div className="mt-2">
                    <Badge variant="secondary" className="text-xs">
                      {repo.active_tasks_count} tarea{repo.active_tasks_count !== 1 ? 's' : ''} activa{repo.active_tasks_count !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {onConfigure && !compact && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              onConfigure()
            }}
          >
            <Settings className="h-4 w-4" />
            <span className="sr-only">Configurar</span>
          </Button>
        )}
      </div>
    </div>
  )
}
