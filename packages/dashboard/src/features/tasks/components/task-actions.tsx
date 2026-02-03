'use client'

import { useState } from 'react'
import {
  Play,
  XCircle,
  Plus,
  ThumbsUp,
  ExternalLink,
  RefreshCw,
  Loader2,
  GitMerge,
  MessageSquareWarning,
  Ban,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useTaskActions } from '../hooks/use-task-actions'
import { FeedbackForm } from './feedback-form'
import type { Task, TaskStatus } from '../types'

interface TaskActionsProps {
  task: Task
}

type ActionType =
  | 'execute'
  | 'approve'
  | 'cancel'
  | 'extend'
  | 'retry'
  | 'start_fresh'
  | 'view_pr'
  | 'request_changes'
  | 'mark_merged'
  | 'mark_closed'

type ActionConfig = {
  type: ActionType
  label: string
  icon: React.ReactNode
  variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  isDestructive?: boolean
  isExternal?: boolean
  requiresInput?: boolean
  href?: string
}

function getActionsForStatus(task: Task): ActionConfig[] {
  const status = task.status

  const actionsByStatus: Record<TaskStatus, ActionConfig[]> = {
    backlog: [
      {
        type: 'execute',
        label: 'Execute',
        icon: <Play className="h-4 w-4" />,
        variant: 'default',
      },
    ],
    planning: [
      {
        type: 'cancel',
        label: 'Cancel',
        icon: <XCircle className="h-4 w-4" />,
        variant: 'destructive',
        isDestructive: true,
      },
    ],
    in_progress: [
      {
        type: 'extend',
        label: 'Extend Timeout',
        icon: <Plus className="h-4 w-4" />,
        variant: 'outline',
      },
      {
        type: 'cancel',
        label: 'Cancel',
        icon: <XCircle className="h-4 w-4" />,
        variant: 'destructive',
        isDestructive: true,
      },
    ],
    awaiting_review: [
      {
        type: 'approve',
        label: 'Approve',
        icon: <ThumbsUp className="h-4 w-4" />,
        variant: 'default',
      },
      {
        type: 'cancel',
        label: 'Cancel',
        icon: <XCircle className="h-4 w-4" />,
        variant: 'destructive',
        isDestructive: true,
      },
    ],
    approved: [],
    pr_created: [
      ...(task.pr_url
        ? [
            {
              type: 'view_pr' as const,
              label: 'View PR',
              icon: <ExternalLink className="h-4 w-4" />,
              variant: 'outline' as const,
              isExternal: true,
              href: task.pr_url,
            },
          ]
        : []),
      {
        type: 'request_changes',
        label: 'Request Changes',
        icon: <MessageSquareWarning className="h-4 w-4" />,
        variant: 'secondary',
        requiresInput: true,
      },
      {
        type: 'mark_merged',
        label: 'Mark as Merged',
        icon: <GitMerge className="h-4 w-4" />,
        variant: 'default',
      },
      {
        type: 'mark_closed',
        label: 'Mark as Closed',
        icon: <Ban className="h-4 w-4" />,
        variant: 'destructive',
        isDestructive: true,
      },
    ],
    changes_requested: [
      {
        type: 'execute',
        label: 'Resume Work',
        icon: <Play className="h-4 w-4" />,
        variant: 'default',
      },
      {
        type: 'mark_closed',
        label: 'Mark as Closed',
        icon: <Ban className="h-4 w-4" />,
        variant: 'destructive',
        isDestructive: true,
      },
    ],
    done: task.pr_url
      ? [
          {
            type: 'view_pr',
            label: 'View PR',
            icon: <ExternalLink className="h-4 w-4" />,
            variant: 'outline',
            isExternal: true,
            href: task.pr_url,
          },
        ]
      : [],
    failed: [
      {
        type: 'retry',
        label: 'Retry',
        icon: <RefreshCw className="h-4 w-4" />,
        variant: 'default',
      },
      {
        type: 'start_fresh',
        label: 'Start Fresh',
        icon: <Trash2 className="h-4 w-4" />,
        variant: 'destructive',
        isDestructive: true,
      },
    ],
  }

  return actionsByStatus[status]
}

function RequestChangesDialog({
  onSubmit,
  isPending,
  disabled,
}: {
  onSubmit: (feedback: string) => void
  isPending: boolean
  disabled: boolean
}) {
  const [feedback, setFeedback] = useState('')
  const [open, setOpen] = useState(false)

  const handleSubmit = () => {
    if (feedback.trim()) {
      onSubmit(feedback.trim())
      setFeedback('')
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="w-full justify-start" disabled={disabled}>
          <MessageSquareWarning className="h-4 w-4" />
          Request Changes
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Changes</DialogTitle>
          <DialogDescription>
            Provide feedback for the agent. The agent will resume work to address your feedback.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="feedback">Feedback</Label>
            <Textarea
              id="feedback"
              placeholder="Describe the changes you'd like the agent to make..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!feedback.trim() || isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Feedback'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TaskActions({ task }: TaskActionsProps) {
  const actions = getActionsForStatus(task)
  const { execute, approve, cancel, extend, requestChanges, markPRMerged, markPRClosed, retry, cleanupWorktree } =
    useTaskActions(task.id)

  // Helper to check if any action is pending
  const isAnyActionPending =
    execute.isPending ||
    approve.isPending ||
    cancel.isPending ||
    extend.isPending ||
    requestChanges.isPending ||
    markPRMerged.isPending ||
    markPRClosed.isPending ||
    retry.isPending ||
    cleanupWorktree.isPending

  // Handler for start_fresh: cleanup worktree then execute
  const handleStartFresh = () => {
    cleanupWorktree.mutate(undefined, {
      onSuccess: () => {
        // After successful cleanup, automatically execute the task
        execute.mutate()
      },
    })
  }

  // Helper to get the handler and pending state for each action type
  const getActionHandler = (type: ActionType) => {
    switch (type) {
      case 'execute':
        return { handler: () => execute.mutate(), isPending: execute.isPending }
      case 'retry':
        return { handler: () => retry.mutate(), isPending: retry.isPending }
      case 'start_fresh':
        return { handler: handleStartFresh, isPending: cleanupWorktree.isPending || execute.isPending }
      case 'approve':
        return { handler: () => approve.mutate(), isPending: approve.isPending }
      case 'cancel':
        return { handler: () => cancel.mutate(), isPending: cancel.isPending }
      case 'extend':
        return { handler: () => extend.mutate(), isPending: extend.isPending }
      case 'mark_merged':
        return { handler: () => markPRMerged.mutate(), isPending: markPRMerged.isPending }
      case 'mark_closed':
        return { handler: () => markPRClosed.mutate(), isPending: markPRClosed.isPending }
      default:
        return { handler: () => {}, isPending: false }
    }
  }

  // Show processing message for approved status
  if (task.status === 'approved') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Processing PR...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // If no actions available
  if (actions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No actions available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action) => {
          const { handler, isPending } = getActionHandler(action.type)

          // External link button
          if (action.isExternal && action.href) {
            return (
              <Button
                key={action.label}
                variant={action.variant}
                className="w-full justify-start"
                asChild
              >
                <a href={action.href} target="_blank" rel="noopener noreferrer">
                  {action.icon}
                  {action.label}
                </a>
              </Button>
            )
          }

          // Request changes with input dialog
          if (action.type === 'request_changes') {
            return (
              <RequestChangesDialog
                key={action.label}
                onSubmit={(feedback) => requestChanges.mutate(feedback)}
                isPending={requestChanges.isPending}
                disabled={isAnyActionPending}
              />
            )
          }

          // Destructive action with AlertDialog
          if (action.isDestructive) {
            const isMarkClosed = action.type === 'mark_closed'
            const isStartFresh = action.type === 'start_fresh'

            let dialogTitle = 'Cancel Task'
            let dialogDescription = 'Are you sure you want to cancel this task? This action cannot be undone and will stop any ongoing processing.'
            let confirmLabel = 'Cancel Task'
            let pendingLabel = 'Cancelling...'
            let cancelLabel = 'Keep Task'

            if (isMarkClosed) {
              dialogTitle = 'Close PR'
              dialogDescription = 'Are you sure you want to mark this PR as closed? The task will be marked as failed.'
              confirmLabel = 'Close PR'
              pendingLabel = 'Closing...'
            } else if (isStartFresh) {
              dialogTitle = 'Start Fresh'
              dialogDescription = 'This will discard all previous agent work and start from scratch. Are you sure?'
              confirmLabel = 'Start Fresh'
              pendingLabel = 'Cleaning up...'
              cancelLabel = 'Cancel'
            }

            return (
              <AlertDialog key={action.label}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant={action.variant}
                    className="w-full justify-start"
                    disabled={isAnyActionPending}
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : action.icon}
                    {isPending ? pendingLabel : action.label}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
                    <AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handler}
                      disabled={isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {pendingLabel}
                        </>
                      ) : (
                        confirmLabel
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )
          }

          // Regular button
          return (
            <Button
              key={action.label}
              variant={action.variant}
              className="w-full justify-start"
              disabled={isAnyActionPending}
              onClick={handler}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : action.icon}
              {isPending ? `${action.label}ing...` : action.label}
            </Button>
          )
        })}

        {/* Feedback form for in_progress status */}
        {task.status === 'in_progress' && <FeedbackForm task={task} />}
      </CardContent>
    </Card>
  )
}
