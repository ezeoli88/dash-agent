'use client'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { Task } from '@/features/tasks/types'
import type { BoardColumnConfig } from '../types'
import { BoardCard } from './board-card'

interface BoardColumnProps {
  config: BoardColumnConfig
  tasks: Task[]
}

/**
 * Column component for the Kanban board.
 * Displays a header with title and task count, followed by a scrollable list of cards.
 */
export function BoardColumn({ config, tasks }: BoardColumnProps) {
  const { title, color, bgColor, borderColor } = config
  const count = tasks.length

  return (
    <div
      className={cn(
        'flex h-full min-w-[280px] max-w-[320px] flex-col rounded-lg border',
        borderColor,
        bgColor
      )}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-inherit">
        <div className="flex items-center gap-2">
          <h3 className={cn('text-sm font-semibold', color)}>{title}</h3>
          <span
            className={cn(
              'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium',
              color,
              'bg-background/80'
            )}
          >
            {count}
          </span>
        </div>
      </div>

      {/* Column Content */}
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2 pb-2">
          {tasks.length === 0 ? (
            <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-muted-foreground/25">
              <p className="text-xs text-muted-foreground">No tasks</p>
            </div>
          ) : (
            tasks.map((task) => <BoardCard key={task.id} task={task} />)
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * Skeleton loader for board column
 */
export function BoardColumnSkeleton() {
  return (
    <div className="flex h-full min-w-[280px] max-w-[320px] flex-col rounded-lg border bg-muted/30 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <div className="h-4 w-20 rounded bg-muted" />
          <div className="h-5 w-5 rounded-full bg-muted" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex-1 p-2 space-y-2">
        <div className="h-24 rounded-lg bg-muted" />
        <div className="h-24 rounded-lg bg-muted" />
        <div className="h-24 rounded-lg bg-muted" />
      </div>
    </div>
  )
}
