'use client'

import { useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { taskKeys } from '@/features/tasks/hooks/query-keys'
import { useBoardTasks } from '../hooks/use-board-tasks'
import { BOARD_COLUMNS } from '../types'
import { BoardHeader } from './board-header'
import { BoardColumn, BoardColumnSkeleton } from './board-column'

interface BoardViewProps {
  initialRepoId?: string
}

/**
 * Main Kanban board view component.
 * Displays tasks organized in columns based on their status.
 */
export function BoardView({ initialRepoId }: BoardViewProps) {
  const [selectedRepoId, setSelectedRepoId] = useState<string | undefined>(initialRepoId)
  const queryClient = useQueryClient()

  const { columns, isLoading, isError, error, totalTasks } = useBoardTasks({
    repositoryId: selectedRepoId,
  })

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: taskKeys.all })
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        <BoardHeader selectedRepoId={selectedRepoId} onRepoChange={setSelectedRepoId} />
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
      <BoardHeader selectedRepoId={selectedRepoId} onRepoChange={setSelectedRepoId} />

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

      {/* Footer info */}
      {!isLoading && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
            {selectedRepoId && ' in this repository'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="gap-2 text-muted-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      )}
    </div>
  )
}
