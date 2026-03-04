'use client'

import { Play, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SpecStatusBadge } from './spec-status-badge'
import { useSpecUIStore } from '../stores/spec-ui-store'
import { getAgentDisplayInfo } from '@/features/tasks/utils/agent-display'
import type { Task } from '@/features/tasks/types'

interface SpecTableRowProps {
  task: Task
  onGenerate?: (taskId: string) => void
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function SpecTableRow({ task, onGenerate }: SpecTableRowProps) {
  const openDetail = useSpecUIStore((s) => s.openDetail)
  const agentInfo = getAgentDisplayInfo(task.agent_type)

  const displayTitle = task.title || task.user_input?.slice(0, 100) || 'Untitled spec'

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg border border-border bg-card p-4 cursor-pointer transition-colors hover:bg-accent/50'
      )}
      onClick={() => openDetail(task.id)}
    >
      {/* Title and description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{displayTitle}</p>
        {task.user_input && task.title && task.user_input !== task.title && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{task.user_input.slice(0, 120)}</p>
        )}
      </div>

      {/* Agent info */}
      {agentInfo && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          {agentInfo.icon}
          <span className="hidden sm:inline">{agentInfo.name}</span>
        </div>
      )}

      {/* Status badge */}
      <SpecStatusBadge status={task.status} />

      {/* Relative date */}
      <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
        {formatRelativeDate(task.updated_at)}
      </span>

      {/* Quick actions */}
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {task.status === 'draft' && onGenerate && (
          <Button
            variant="ghost"
            size="icon-xs"
            title="Generate spec"
            onClick={() => onGenerate(task.id)}
          >
            <Play className="size-3.5" />
          </Button>
        )}
        {task.status === 'pending_approval' && (
          <Button
            variant="ghost"
            size="icon-xs"
            title="Review spec"
            onClick={() => openDetail(task.id)}
          >
            <Eye className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
