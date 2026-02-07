'use client'

import { useMemo, useEffect } from 'react'
import Link from 'next/link'
import { ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { VisuallyHidden } from 'radix-ui'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/shared/status-badge'
import { truncateText } from '@/lib/formatters'
import { useTask } from '../hooks/use-task'
import { useTaskUIStore } from '../stores/task-ui-store'
import { TaskActions } from './task-actions'
import { AgentModelSelector } from './agent-model-selector'
import { TaskLogs } from './task-logs'
import { TaskDiff } from './task-diff'
import { SpecEditor } from './spec-editor'
import type { TaskStatus } from '../types'

/**
 * Statuses where the Logs tab should be the default.
 * These are "active" statuses where the agent is currently working.
 */
const ACTIVE_STATUSES: TaskStatus[] = [
  'refining',
  'coding',
  'in_progress',
  'planning',
  'approved',
]

/**
 * TaskDrawer - A right-side Sheet that shows a quick preview of a task
 * when clicking a card in the Board (Kanban) view.
 *
 * Displays task status, title, description, action buttons, and
 * tabbed content for Logs and Changes.
 */
export function TaskDrawer() {
  const drawerTaskId = useTaskUIStore((state) => state.drawerTaskId)
  const closeDrawer = useTaskUIStore((state) => state.closeDrawer)

  const isOpen = !!drawerTaskId
  const { data: task, isLoading } = useTask(drawerTaskId ?? '')

  // Close drawer when task is deleted (task disappears while drawer is open)
  useEffect(() => {
    if (isOpen && !isLoading && !task) {
      closeDrawer()
    }
  }, [isOpen, isLoading, task, closeDrawer])

  // Determine default tab based on task status
  const defaultTab = useMemo(() => {
    if (!task) return 'logs'
    if (task.status === 'pending_approval') return 'changes'
    if (ACTIVE_STATUSES.includes(task.status)) return 'logs'
    return 'changes'
  }, [task])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeDrawer()
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-lg w-full flex flex-col p-0 gap-0"
      >
        {isLoading || !task ? (
          <>
            <VisuallyHidden.Root>
              <SheetTitle>Loading task</SheetTitle>
            </VisuallyHidden.Root>
            <DrawerSkeleton />
          </>
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="px-4 pt-4 pb-3 border-b space-y-3 flex-shrink-0">
              <div className="flex items-center justify-between pr-8">
                <StatusBadge status={task.status} />
                <Button variant="ghost" size="sm" asChild>
                  <Link
                    href={`/tasks/${task.id}`}
                    onClick={closeDrawer}
                  >
                    View Full Detail
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
              <VisuallyHidden.Root>
                <SheetTitle>{task.title}</SheetTitle>
              </VisuallyHidden.Root>
              <SheetDescription className="text-sm text-foreground line-clamp-4">
                {truncateText(task.description || task.title, 250)}
              </SheetDescription>
            </SheetHeader>

            {/* Actions */}
            <div className="px-4 py-3 border-b flex-shrink-0">
              <TaskActions task={task} variant="compact" />
            </div>

            {/* Agent / Model Selector */}
            <div className="px-4 py-3 border-b flex-shrink-0">
              <AgentModelSelector task={task} variant="compact" />
            </div>

            {/* Tabbed content — forceMount keeps SSE/state alive on tab switch */}
            <Tabs
              defaultValue={defaultTab}
              className="flex flex-col flex-1 min-h-0"
            >
              <TabsList className="mx-4 mt-3 flex-shrink-0">
                <TabsTrigger value="logs">Logs</TabsTrigger>
                <TabsTrigger value="changes">Changes</TabsTrigger>
              </TabsList>

              <TabsContent
                value="logs"
                forceMount
                className="flex-1 min-h-0 overflow-hidden mt-0 px-0 data-[state=inactive]:hidden"
              >
                {task.status === 'draft' ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground">
                    <p className="text-sm">Generate a spec to start seeing logs.</p>
                  </div>
                ) : (
                  <TaskLogs
                    task={task}
                    showFeedbackForm={false}
                    className="h-full"
                  />
                )}
              </TabsContent>

              <TabsContent
                value="changes"
                forceMount
                className="flex-1 min-h-0 overflow-y-auto mt-0 px-4 pb-4 data-[state=inactive]:hidden"
              >
                {task.status === 'draft' ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground">
                    <p className="text-sm">Generate a spec to start seeing changes.</p>
                  </div>
                ) : task.status === 'refining' ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="flex items-center gap-3 mb-4">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <Sparkles className="h-6 w-6 text-primary animate-pulse" />
                    </div>
                    <h3 className="text-base font-semibold mb-2">PM Agent is working...</h3>
                    <p className="text-sm text-muted-foreground text-center">
                      Generating a detailed specification. This usually takes 30-60 seconds.
                    </p>
                  </div>
                ) : task.status === 'pending_approval' ? (
                  <SpecEditor task={task} hideActions />
                ) : (
                  <TaskDiff taskId={task.id} />
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * Skeleton shown while task data is loading in the drawer.
 */
function DrawerSkeleton() {
  return (
    <div className="p-4 space-y-4">
      {/* Status badge and link */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-28" />
      </div>
      {/* Title */}
      <Skeleton className="h-5 w-3/4" />
      {/* Description */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      {/* Tab area */}
      <div className="pt-4 space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-20" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  )
}
