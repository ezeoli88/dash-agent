'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, CheckCircle2, MessageSquare, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useTaskActions } from '../hooks/use-task-actions'
import type { Task } from '../types'

interface FeedbackFormProps {
  task: Task
  maxLength?: number
  onFeedbackSent?: (message: string) => void
  className?: string
}

const MAX_LENGTH_DEFAULT = 2000

export function FeedbackForm({
  task,
  maxLength = MAX_LENGTH_DEFAULT,
  onFeedbackSent,
  className,
}: FeedbackFormProps) {
  const [message, setMessage] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { sendFeedback } = useTaskActions(task.id)

  const isDisabled = task.status !== 'in_progress' && task.status !== 'planning'
  const canSubmit = message.trim().length > 0 && !sendFeedback.isPending && !isDisabled
  const charCount = message.length
  const isNearLimit = charCount > maxLength * 0.9
  const isOverLimit = charCount > maxLength

  // Focus textarea on mount if task is active
  useEffect(() => {
    if (!isDisabled && textareaRef.current) {
      // Slight delay to prevent layout issues
      const timer = setTimeout(() => {
        textareaRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isDisabled])

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    if (!canSubmit || isOverLimit) return

    const trimmedMessage = message.trim()
    sendFeedback.mutate(trimmedMessage, {
      onSuccess: () => {
        setMessage('')
        setShowSuccess(true)
        // Notify parent component
        onFeedbackSent?.(trimmedMessage)
        // Hide success indicator after animation
        setTimeout(() => setShowSuccess(false), 2000)
        // Re-focus textarea
        textareaRef.current?.focus()
      },
    })
  }, [canSubmit, isOverLimit, message, sendFeedback, onFeedbackSent])

  // Handle Ctrl+Enter to submit
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  // Disabled state message
  if (isDisabled) {
    return (
      <div className={cn('p-4 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20', className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <MessageSquare className="size-4" />
          <span className="text-sm">
            Feedback can only be sent when a task is actively running
          </span>
        </div>
        <p className="text-xs text-muted-foreground/70 mt-1 ml-6">
          Start the task to enable communication with the agent.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-3', className)}>
      <div className="space-y-2">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            id="feedback-message"
            placeholder="Provide additional context, ask questions, or give instructions to the agent...

Examples:
- Focus on error handling first
- Can you explain your approach?
- Skip the unit tests for now"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sendFeedback.isPending}
            className={cn(
              'min-h-[120px] resize-none pr-12 transition-colors',
              isOverLimit && 'border-red-500 focus-visible:ring-red-500/50',
              sendFeedback.isPending && 'opacity-60'
            )}
            aria-label="Feedback message"
            aria-describedby="feedback-hint char-count"
          />

          {/* Success overlay */}
          {showSuccess && (
            <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/10 backdrop-blur-[1px] rounded-md border border-emerald-500/30 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-emerald-500">
                <CheckCircle2 className="size-5" />
                <span className="font-medium">Feedback sent!</span>
              </div>
            </div>
          )}
        </div>

        {/* Character counter and hints */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-muted-foreground" id="feedback-hint">
            <Keyboard className="size-3" />
            <span>Ctrl+Enter to send</span>
          </div>

          <div
            id="char-count"
            className={cn(
              'tabular-nums transition-colors',
              isOverLimit
                ? 'text-red-500 font-medium'
                : isNearLimit
                  ? 'text-amber-500'
                  : 'text-muted-foreground'
            )}
          >
            {charCount.toLocaleString()} / {maxLength.toLocaleString()}
          </div>
        </div>
      </div>

      <Button
        type="submit"
        size="sm"
        className={cn(
          'w-full transition-all',
          showSuccess && 'bg-emerald-600 hover:bg-emerald-700'
        )}
        disabled={!canSubmit || isOverLimit}
      >
        {sendFeedback.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : showSuccess ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Sent!
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Send Feedback
          </>
        )}
      </Button>
    </form>
  )
}
