'use client'

import { Loader2, MessageSquare, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeTime, truncateText } from '@/lib/formatters'
import { StatusBadge } from '@/components/shared/status-badge'
import { useTaskUIStore } from '@/features/tasks/stores/task-ui-store'
import type { Task } from '@/features/tasks/types'

interface BoardCardProps {
  task: Task
}

/**
 * Card component for displaying a task in the Kanban board.
 * Shows task ID, title, status badge, and relative time.
 * Clicking the card navigates to the task detail page.
 */
export function BoardCard({ task }: BoardCardProps) {
  const openDrawer = useTaskUIStore((state) => state.openDrawer)
  const hasUnreadComments = useTaskUIStore((state) => state.hasUnreadComments(task.id))
  const unreadCount = useTaskUIStore((state) => state.getUnreadCount(task.id))

  // Statuses that show a spinner (agent is working)
  const isWorking = task.status === 'refining' || task.status === 'coding' || task.status === 'approved'

  // Status that indicates error
  const isFailed = task.status === 'failed'

  const handleClick = () => {
    openDrawer(task.id)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative rounded-lg border bg-card p-3 shadow-sm',
        'cursor-pointer transition-all duration-200 ease-out',
        'hover:border-accent hover:shadow-md hover:-translate-y-0.5',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isWorking && 'border-primary/50',
        isFailed && 'border-destructive/50'
      )}
    >
      {/* Working indicator */}
      {isWorking && (
        <div className="absolute -top-1 -right-1 h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/75 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
        </div>
      )}

      {/* Task ID and Title */}
      <div className="space-y-1.5">
        <h4 className="text-sm font-medium leading-tight text-foreground group-hover:text-primary line-clamp-2">
          {truncateText(task.title, 80)}
        </h4>

        {/* Status and indicators row */}
        <div className="flex items-center gap-2">
          <StatusBadge status={task.status} className="text-xs" />

          {isWorking && (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          )}

          {isFailed && (
            <AlertCircle className="h-3 w-3 text-destructive" />
          )}
        </div>
      </div>

      {/* Footer: time and unread comments */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatRelativeTime(task.updated_at)}</span>

        {hasUnreadComments && (
          <span className="inline-flex items-center gap-1 text-blue-500 dark:text-blue-400">
            <MessageSquare className="h-3 w-3" />
            {unreadCount}
          </span>
        )}
      </div>
    </div>
  )
}
