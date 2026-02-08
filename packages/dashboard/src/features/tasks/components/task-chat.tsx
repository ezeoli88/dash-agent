'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  MessageSquare,
  FileText,
  Pencil,
  Terminal,
  FilePlus,
  Search,
  Loader2,
  Check,
  CheckCircle,
  X,
  Send,
  Keyboard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useTaskChat } from '../hooks/use-task-chat'
import type { ChatEntry } from '../hooks/use-task-chat'
import { useTaskActions } from '../hooks/use-task-actions'
import { useTaskChanges } from '../hooks/use-task-changes'
import { toast } from 'sonner'
import type { Task } from '../types'
import type { ChatMessageEvent, ToolActivityEvent } from '@dash-agent/shared'
import { TaskDiff } from './task-diff'

interface TaskChatProps {
  task: Task
  readOnly?: boolean
  className?: string
}

// ============================================================================
// Tool icon mapping
// ============================================================================

function getToolIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower === 'read') return FileText
  if (lower === 'edit') return Pencil
  if (lower === 'bash') return Terminal
  if (lower === 'write') return FilePlus
  if (lower === 'grep' || lower === 'glob') return Search
  return Terminal
}

// ============================================================================
// ChatMessageBubble
// ============================================================================

function ChatMessageBubble({ message }: { message: ChatMessageEvent }) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center py-1.5">
        <span className="text-xs text-zinc-400 dark:text-zinc-500 italic">
          {message.content}
        </span>
      </div>
    )
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end py-1.5">
        <div className="max-w-[85%] rounded-lg px-3 py-2 bg-blue-600 dark:bg-blue-500 text-white dark:text-white">
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    )
  }

  // assistant
  return (
    <div className="flex justify-start py-1.5">
      <div className="max-w-[85%] rounded-lg px-3 py-2 bg-zinc-800 dark:bg-zinc-200 text-zinc-100 dark:text-zinc-900">
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </div>
  )
}

// ============================================================================
// ToolBadge
// ============================================================================

function ToolBadge({ activity }: { activity: ToolActivityEvent }) {
  const Icon = getToolIcon(activity.name)
  const displayName = activity.name || 'Tool'

  return (
    <div className="flex items-center py-0.5">
      <Badge
        variant="secondary"
        className="gap-1.5 px-2 py-0.5 text-xs font-normal bg-zinc-800 dark:bg-zinc-200 text-zinc-300 dark:text-zinc-600 border-0"
      >
        <Icon className="size-3 shrink-0" />
        <span className="font-medium text-zinc-200 dark:text-zinc-700">{displayName}</span>
        {activity.summary && (
          <span className="truncate max-w-[200px]">{activity.summary}</span>
        )}
        {activity.status === 'running' && (
          <Loader2 className="size-3 animate-spin text-blue-400 dark:text-blue-600 shrink-0" />
        )}
        {activity.status === 'completed' && (
          <Check className="size-3 text-emerald-400 dark:text-emerald-600 shrink-0" />
        )}
        {activity.status === 'error' && (
          <X className="size-3 text-red-400 dark:text-red-600 shrink-0" />
        )}
      </Badge>
    </div>
  )
}

// ============================================================================
// ChatInput
// ============================================================================

function ChatInput({ taskId, disabled }: { taskId: string; disabled: boolean }) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { sendFeedback } = useTaskActions(taskId)

  const canSubmit = message.trim().length > 0 && !sendFeedback.isPending && !disabled

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return
    const trimmed = message.trim()
    sendFeedback.mutate(trimmed, {
      onSuccess: () => {
        setMessage('')
        textareaRef.current?.focus()
      },
    })
  }, [canSubmit, message, sendFeedback])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  if (disabled) return null

  return (
    <div className="border-t bg-background p-3 space-y-2">
      <div className="flex gap-2">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message to the agent..."
          disabled={sendFeedback.isPending}
          className="min-h-[40px] max-h-[120px] resize-none text-sm"
          rows={1}
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="shrink-0 self-end"
        >
          {sendFeedback.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Keyboard className="size-3" />
        <span>Ctrl+Enter to send</span>
      </div>
    </div>
  )
}

// ============================================================================
// CompletionCard — inline diff shown when the agent completes
// ============================================================================

const COMPLETION_STATUSES = ['awaiting_review', 'review', 'pr_created', 'done']

function CompletionCard({ taskId }: { taskId: string }) {
  const { data } = useTaskChanges(taskId)

  // Don't render the card if there are no changes
  if (!data || data.files.length === 0) return null

  return (
    <Card className="mt-3 border-emerald-500/30 bg-emerald-500/5">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="size-4" />
          Agent completed. Review changes below.
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <TaskDiff taskId={taskId} />
      </CardContent>
    </Card>
  )
}

// ============================================================================
// TaskChat (main component)
// ============================================================================

const ACTIVE_STATUSES = ['coding', 'in_progress', 'planning', 'approved']

export function TaskChat({ task, readOnly = false, className }: TaskChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const isActive = ACTIVE_STATUSES.includes(task.status)
  const hasHistory = task.status !== 'draft'

  const { entries, isConnected, status } = useTaskChat({
    taskId: task.id,
    enabled: hasHistory,
    onStatusChange: () => {},
    onComplete: (prUrl) => {
      toast.success('Task completed!', {
        description: prUrl ? `PR: ${prUrl}` : 'Task finished successfully',
      })
    },
    onError: (message) => {
      toast.error('Task error', { description: message })
    },
  })

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries])

  const renderEntry = (entry: ChatEntry, index: number) => {
    if (entry.type === 'message') {
      return (
        <ChatMessageBubble
          key={(entry.data as ChatMessageEvent).id + '-' + index}
          message={entry.data as ChatMessageEvent}
        />
      )
    }
    return (
      <ToolBadge
        key={(entry.data as ToolActivityEvent).id + '-' + index}
        activity={entry.data as ToolActivityEvent}
      />
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Chat messages area — dark bg in light theme, light bg in dark theme */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-zinc-900 dark:bg-zinc-100"
      >
        <div className="p-3 space-y-0.5">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-400 dark:text-zinc-500">
              <MessageSquare className="size-8 mb-3 opacity-40" />
              <p className="text-sm">
                {isActive
                  ? 'Waiting for agent output...'
                  : 'Click Start to begin chatting with the agent'}
              </p>
            </div>
          ) : (
            entries.map(renderEntry)
          )}
          {COMPLETION_STATUSES.includes(task.status) && (
            <CompletionCard taskId={task.id} />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Chat input */}
      {!readOnly && (
        <ChatInput taskId={task.id} disabled={!isActive} />
      )}
    </div>
  )
}
