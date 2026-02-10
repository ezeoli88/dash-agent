'use client'

import { MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeTime, extractRepoName, truncateText } from '@/lib/formatters'
import { StatusBadge } from '@/components/shared/status-badge'
import { useTaskUIStore } from '../stores/task-ui-store'
import type { Task } from '../types'

interface TaskListItemProps {
  task: Task
  isSelected?: boolean
}

export function TaskListItem({ task, isSelected }: TaskListItemProps) {
  const repoName = extractRepoName(task.repo_url)
  const isInProgress = task.status === 'in_progress'
  const hasUnreadComments = useTaskUIStore((state) => state.hasUnreadComments(task.id))
  const unreadCount = useTaskUIStore((state) => state.getUnreadCount(task.id))
  const openDrawer = useTaskUIStore((state) => state.openDrawer)

  return (
    <button
      type="button"
      onClick={() => openDrawer(task.id)}
      className={cn(
        'group flex items-center gap-3 rounded-lg border border-border bg-card p-3 w-full text-left',
        'transition-all duration-200 ease-out',
        'hover:border-accent hover:bg-accent/50 hover:shadow-sm hover:-translate-y-0.5',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isSelected && 'border-primary bg-primary/5',
        isInProgress && 'animate-pulse-subtle'
      )}
    >
      {/* Status indicator dot */}
      <div
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          task.status === 'in_progress' && 'bg-yellow-500',
          task.status === 'done' && 'bg-green-500',
          task.status === 'failed' && 'bg-red-500',
          task.status === 'awaiting_review' && 'bg-purple-500',
          task.status === 'approved' && 'bg-indigo-500',
          task.status === 'planning' && 'bg-blue-500',
          task.status === 'backlog' && 'bg-gray-400',
          task.status === 'pr_created' && 'bg-indigo-600',
          task.status === 'changes_requested' && 'bg-orange-500'
        )}
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-medium text-foreground group-hover:text-primary">
          {truncateText(task.title, 60)}
        </h4>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{repoName}</span>
          <span className="shrink-0">&#183;</span>
          <span className="shrink-0">{formatRelativeTime(task.updated_at)}</span>
          {hasUnreadComments && (
            <>
              <span className="shrink-0">&#183;</span>
              <span className="inline-flex items-center gap-1 text-blue-500 dark:text-blue-400">
                <MessageSquare className="h-3 w-3" />
                {unreadCount}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Status badge */}
      <StatusBadge status={task.status} className="shrink-0" />
    </button>
  )
}

// Compact version for sidebar
interface TaskListItemCompactProps {
  task: Task
  isSelected?: boolean
}

export function TaskListItemCompact({ task, isSelected }: TaskListItemCompactProps) {
  const isInProgress = task.status === 'in_progress'
  const openDrawer = useTaskUIStore((state) => state.openDrawer)

  return (
    <button
      type="button"
      onClick={() => openDrawer(task.id)}
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 w-full text-left',
        'transition-all duration-150 ease-out',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        isSelected && 'bg-sidebar-accent text-sidebar-accent-foreground',
        isInProgress && 'animate-pulse-subtle'
      )}
    >
      {/* Status indicator dot */}
      <div
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          task.status === 'in_progress' && 'bg-yellow-500',
          task.status === 'done' && 'bg-green-500',
          task.status === 'failed' && 'bg-red-500',
          task.status === 'awaiting_review' && 'bg-purple-500',
          task.status === 'approved' && 'bg-indigo-500',
          task.status === 'planning' && 'bg-blue-500',
          task.status === 'backlog' && 'bg-gray-400',
          task.status === 'pr_created' && 'bg-indigo-600',
          task.status === 'changes_requested' && 'bg-orange-500'
        )}
      />

      {/* Title */}
      <span className="min-w-0 flex-1 truncate text-sm">
        {truncateText(task.title, 40)}
      </span>

      {/* Time */}
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatRelativeTime(task.updated_at)}
      </span>
    </button>
  )
}
