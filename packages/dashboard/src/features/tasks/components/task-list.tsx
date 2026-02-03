'use client'

import { useMemo, useState, useEffect } from 'react'
import { AlertCircle, ClipboardList, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { useTasks } from '../hooks/use-tasks'
import { useTaskUIStore } from '../stores/task-ui-store'
import { TaskListItem, TaskListItemCompact } from './task-list-item'
import { TaskListSkeleton } from './task-list-skeleton'
import type { Task } from '../types'

interface TaskListProps {
  className?: string
  compact?: boolean
  onTaskSelect?: (task: Task) => void
}

export function TaskList({ className, compact = false, onTaskSelect }: TaskListProps) {
  // Track mounted state to prevent hydration mismatch
  // Server and client have different initial states for TanStack Query and Zustand
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const { statusFilter, searchQuery, selectedTaskId } = useTaskUIStore()

  // Build filters from Zustand store
  const filters = useMemo(
    () => ({
      status: statusFilter.length > 0 ? statusFilter : undefined,
      search: searchQuery || undefined,
    }),
    [statusFilter, searchQuery]
  )

  const { data: tasks, isLoading, isError, error, refetch, isFetching } = useTasks(filters)

  // Filter tasks client-side based on Zustand store (for mock data scenarios)
  const filteredTasks = useMemo(() => {
    if (!tasks) return []

    let filtered = [...tasks]

    // Apply status filter if not already applied by API
    if (statusFilter.length > 0) {
      filtered = filtered.filter((task) => statusFilter.includes(task.status))
    }

    // Apply search filter if not already applied by API
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (task) =>
          task.title.toLowerCase().includes(searchLower) ||
          task.description.toLowerCase().includes(searchLower)
      )
    }

    // Sort by updated_at (most recent first)
    filtered.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )

    return filtered
  }, [tasks, statusFilter, searchQuery])

  // Show skeleton during SSR and initial client render to prevent hydration mismatch
  // This ensures server and client render the same content during hydration
  if (!isMounted || isLoading) {
    return <TaskListSkeleton count={compact ? 3 : 5} />
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <h3 className="mt-4 text-lg font-semibold">Failed to load tasks</h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </p>
        <Button onClick={() => refetch()} className="mt-4" variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    )
  }

  // Empty state
  if (!filteredTasks || filteredTasks.length === 0) {
    const hasFilters = statusFilter.length > 0 || searchQuery.length > 0

    return (
      <EmptyState
        icon={<ClipboardList />}
        title={hasFilters ? 'No tasks match your filters' : 'No tasks yet'}
        description={
          hasFilters
            ? 'Try adjusting your filters or search query to find tasks.'
            : 'Get started by creating a new task for the AI agent using the button in the header.'
        }
        action={
          hasFilters
            ? {
                label: 'Clear filters',
                onClick: () => {
                  useTaskUIStore.getState().clearFilters()
                },
              }
            : undefined
        }
        className={className}
      />
    )
  }

  // Task list
  if (compact) {
    return (
      <div className={className}>
        <div className="flex items-center justify-between mb-2 px-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Tasks ({filteredTasks.length})
          </span>
          {isFetching && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="space-y-0.5">
          {filteredTasks.map((task) => (
            <TaskListItemCompact
              key={task.id}
              task={task}
              isSelected={task.id === selectedTaskId}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">
          {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
        </span>
        {isFetching && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Refreshing...
          </span>
        )}
      </div>
      <div className="space-y-2">
        {filteredTasks.map((task) => (
          <TaskListItem
            key={task.id}
            task={task}
            isSelected={task.id === selectedTaskId}
          />
        ))}
      </div>
    </div>
  )
}
