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
  X,
  Send,
  Keyboard,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { taskKeys } from '../hooks/query-keys'
import { useTaskChat } from '../hooks/use-task-chat'
import type { ChatEntry } from '../hooks/use-task-chat'
import { useTaskActions } from '../hooks/use-task-actions'
import { toast } from 'sonner'
import type { Task } from '../types'
import type { ChatMessageEvent, ToolActivityEvent } from '@dash-agent/shared'

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

  // Clean up summary: remove long absolute paths, keep just the meaningful part
  const cleanSummary = activity.summary
    ? activity.summary
        .replace(/^.*[/\\]worktrees[/\\][^/\\]+[/\\]/, '') // strip worktree prefix
        .replace(/^.*[/\\](?=[^/\\]+$)/, '') // for single file, keep just filename
    : ''

  return (
    <div className="flex items-center py-0.5">
      <Badge
        variant="secondary"
        className="gap-1.5 px-2 py-0.5 text-xs font-normal bg-zinc-800 dark:bg-zinc-200 text-zinc-300 dark:text-zinc-600 border-0 max-w-full"
      >
        {activity.status === 'running' ? (
          <Loader2 className="size-3 animate-spin text-blue-400 dark:text-blue-600 shrink-0" />
        ) : activity.status === 'completed' ? (
          <Check className="size-3 text-emerald-400 dark:text-emerald-600 shrink-0" />
        ) : activity.status === 'error' ? (
          <X className="size-3 text-red-400 dark:text-red-600 shrink-0" />
        ) : (
          <Icon className="size-3 shrink-0" />
        )}
        <span className="font-medium text-zinc-200 dark:text-zinc-700">{displayName}</span>
        {cleanSummary && (
          <span className="truncate max-w-[300px] text-zinc-400 dark:text-zinc-500">{cleanSummary}</span>
        )}
      </Badge>
    </div>
  )
}

// ============================================================================
// ChatInput
// ============================================================================

function ChatInput({ taskId, disabled, disabledReason, onMessageSent, placeholder }: { taskId: string; disabled: boolean; disabledReason?: string; onMessageSent?: (content: string) => void; placeholder?: string }) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { sendFeedback } = useTaskActions(taskId)

  const canSubmit = message.trim().length > 0 && !sendFeedback.isPending && !disabled

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return
    const trimmed = message.trim()
    // Show the message in chat immediately (optimistic)
    onMessageSent?.(trimmed)
    setMessage('')
    sendFeedback.mutate(trimmed, {
      onSuccess: () => {
        textareaRef.current?.focus()
      },
    })
  }, [canSubmit, message, sendFeedback, onMessageSent])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  if (disabled) {
    if (disabledReason) {
      return (
        <div className="border-t bg-background px-4 py-3">
          <p className="text-sm text-muted-foreground text-center">{disabledReason}</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="border-t bg-background p-3 space-y-2">
      <div className="flex gap-2">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Send a message to the agent..."}
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
        <span>Enter to send · Shift+Enter for new line</span>
      </div>
    </div>
  )
}

// ============================================================================
// TaskChat (main component)
// ============================================================================

const TERMINAL_STATUSES = ['done', 'failed']

export function TaskChat({ task, readOnly = false, className }: TaskChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const isFailed = task.status === 'failed'
  const isDone = task.status === 'done'
  const isTerminal = TERMINAL_STATUSES.includes(task.status)
  const isDraft = task.status === 'draft'
  const hasHistory = !isDraft
  const canChat = !isDraft && !isTerminal

  // Compute a reason to show when the chat input is disabled
  const disabledReason = isFailed
    ? 'The agent stopped due to an error. You can retry the task from the actions panel.'
    : isDone
      ? 'This task has been completed.'
      : isDraft
        ? undefined // input is hidden entirely for drafts
        : undefined

  // Custom placeholder for plan_review status
  const chatPlaceholder = task.status === 'plan_review'
    ? 'Type to approve the plan and start implementation...'
    : undefined

  // Invalidate task query when SSE reports a status change so the UI refreshes
  const handleStatusChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) })
    queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
  }, [queryClient, task.id])

  const { entries, isConnected, status, addUserMessage } = useTaskChat({
    taskId: task.id,
    enabled: hasHistory,
    onStatusChange: handleStatusChange,
    onComplete: (prUrl) => {
      toast.success('Task completed!', {
        description: prUrl ? `PR: ${prUrl}` : 'Task finished successfully',
      })
    },
    onError: (message) => {
      toast.error('Task failed', { description: message, duration: 8000 })
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

  // Determine empty state message
  const emptyStateMessage = isFailed
    ? 'The agent encountered an error before producing any output.'
    : canChat
      ? 'Waiting for agent output...'
      : 'Click Start to begin chatting with the agent'

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Error banner when task has failed */}
      {isFailed && task.error && (
        <div className="flex items-start gap-2.5 border-b border-red-500/30 bg-red-950/60 dark:bg-red-50 px-4 py-3 text-sm text-red-300 dark:text-red-700">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-red-200 dark:text-red-800">Task failed</p>
            <p className="whitespace-pre-wrap break-words">{task.error}</p>
          </div>
        </div>
      )}

      {/* Chat messages area -- dark bg in light theme, light bg in dark theme */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-zinc-900 dark:bg-zinc-100"
      >
        <div className="p-3 space-y-0.5">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-400 dark:text-zinc-500">
              {isFailed ? (
                <AlertCircle className="size-8 mb-3 opacity-40" />
              ) : (
                <MessageSquare className="size-8 mb-3 opacity-40" />
              )}
              <p className="text-sm">{emptyStateMessage}</p>
            </div>
          ) : (
            entries.map(renderEntry)
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Chat input or disabled reason */}
      {!readOnly && (
        <ChatInput
          taskId={task.id}
          disabled={!canChat}
          disabledReason={disabledReason}
          onMessageSent={addUserMessage}
          placeholder={chatPlaceholder}
        />
      )}
    </div>
  )
}
