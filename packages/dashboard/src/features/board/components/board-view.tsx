'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { taskKeys } from '@/features/tasks/hooks/query-keys'
import { useStartTask } from '@/features/tasks/hooks/use-start-task'
import { useBoardTasks } from '../hooks/use-board-tasks'
import { BOARD_COLUMNS } from '../types'
import { BoardHeader } from './board-header'
import { BoardColumn, BoardColumnSkeleton } from './board-column'
import { BoardCard } from './board-card'
import type { Task } from '@/features/tasks/types'

/**
 * Main Kanban board view component.
 * Displays tasks organized in columns based on their status.
 * Supports drag & drop of draft tasks from "Todo" to "In Progress" to auto-start them.
 */
export function BoardView() {
  const queryClient = useQueryClient()
  const startTask = useStartTask()

  const { columns, isLoading, isError, error } = useBoardTasks({})

  // Drag state: tracks the task currently being dragged for the DragOverlay
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  // Require 8px of movement before activating drag to avoid interfering with clicks
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = event.active.data.current?.task as Task | undefined
    if (task) {
      setActiveTask(task)
    }
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const droppedOverId = event.over?.id
    // Only start the task when a draft card is dropped onto the "In Progress" column
    if (droppedOverId === 'inProgress' && activeTask?.status === 'draft') {
      startTask.mutate(activeTask.id)
    }
    setActiveTask(null)
  }, [activeTask, startTask])

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: taskKeys.all })
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        <BoardHeader />
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/50 bg-destructive/10 p-8">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div className="text-center">
            <h3 className="font-semibold text-destructive">Failed to load tasks</h3>
            <p className="text-sm text-muted-foreground">
              {error?.message || 'An unexpected error occurred'}
            </p>
          </div>
          <Button variant="outline" onClick={handleRefresh} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <BoardHeader />

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Board columns */}
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:-mx-6 md:px-6">
          {isLoading ? (
            // Loading skeleton
            BOARD_COLUMNS.map((col) => <BoardColumnSkeleton key={col.id} />)
          ) : (
            // Actual columns
            BOARD_COLUMNS.map((col) => (
              <BoardColumn key={col.id} config={col} tasks={columns[col.id]} />
            ))
          )}
        </div>

        {/* Floating card that follows the cursor during drag */}
        <DragOverlay>
          {activeTask ? <BoardCard task={activeTask} isOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
