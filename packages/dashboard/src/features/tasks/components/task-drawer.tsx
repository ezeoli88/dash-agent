'use client'

import { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { VisuallyHidden } from 'radix-ui'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/shared/status-badge'
import { toast } from 'sonner'
import { useTask } from '../hooks/use-task'
import { useUpdateTask } from '../hooks/use-update-task'
import { useTaskUIStore } from '../stores/task-ui-store'
import { TaskActions } from './task-actions'
import { AgentModelSelector } from './agent-model-selector'
import { InlineEdit } from './inline-edit'
import { TaskChat } from './task-chat'
import { isTerminalStatus, isActiveStatus } from '../types'
import type { Task } from '../types'

/**
 * TaskDrawer - A right-side Sheet that shows a quick preview of a task
 * when clicking a card in the Board (Kanban) view.
 *
 * Displays task status, title, description, action buttons, and
 * a single chat view with inline diff when the agent completes.
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
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" asChild>
                    <Link
                      to={`/tasks/${task.id}`}
                      onClick={closeDrawer}
                    >
                      Detail
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </div>
              <VisuallyHidden.Root>
                <SheetTitle>{task.title}</SheetTitle>
                <SheetDescription>Task details</SheetDescription>
              </VisuallyHidden.Root>
              <DrawerDescription task={task} />
            </SheetHeader>

            {/* Actions */}
            <div className="px-4 py-3 border-b flex-shrink-0">
              <TaskActions task={task} variant="compact" />
            </div>

            {/* Agent / Model Selector */}
            <div className="px-4 py-3 border-b flex-shrink-0">
              <AgentModelSelector task={task} variant="compact" />
            </div>

            {/* Chat content */}
            <div className="flex flex-col flex-1 min-h-0">
              {task.status === 'draft' ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground">
                  <p className="text-sm">Click Start to begin chatting with the agent.</p>
                </div>
              ) : (
                <TaskChat
                  task={task}
                  readOnly={['done', 'failed'].includes(task.status)}
                  className="h-full"
                />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * Editable description inside the drawer header.
 * Allows the user to edit the description and rebuild the spec.
 */
function DrawerDescription({ task }: { task: Task }) {
  const updateTaskMutation = useUpdateTask(task.id)

  const isEditable = !isTerminalStatus(task.status) && !isActiveStatus(task.status)

  const handleSaveDescription = async (newDescription: string) => {
    try {
      await updateTaskMutation.mutateAsync({
        description: newDescription,
        user_input: newDescription,
      })
      toast.success('Descripcion actualizada')
    } catch (error) {
      toast.error('Error al actualizar', {
        description: error instanceof Error ? error.message : 'Error inesperado',
      })
      throw error
    }
  }

  return (
    <InlineEdit
      value={task.description}
      onSave={handleSaveDescription}
      isSaving={updateTaskMutation.isPending}
      disabled={!isEditable}
      multiline
      minLength={1}
      placeholder="Click para agregar descripcion..."
      displayClassName="text-sm leading-relaxed text-foreground whitespace-pre-wrap line-clamp-4"
      inputClassName="text-sm"
    />
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
