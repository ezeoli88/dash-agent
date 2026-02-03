'use client'

import { useRef, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { User, Bot, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Represents a feedback message in the history
 */
export interface FeedbackMessage {
  id: string
  type: 'user' | 'agent'
  message: string
  timestamp: string
}

interface FeedbackHistoryProps {
  messages: FeedbackMessage[]
  className?: string
  maxHeight?: string
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return timestamp
  }
}

function FeedbackMessageItem({ message }: { message: FeedbackMessage }) {
  const isUser = message.type === 'user'

  return (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-lg animate-in slide-in-from-bottom-2 duration-200',
        isUser
          ? 'bg-emerald-500/10 border border-emerald-500/20'
          : 'bg-purple-500/10 border border-purple-500/20'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 size-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-emerald-500/20' : 'bg-purple-500/20'
        )}
      >
        {isUser ? (
          <User className="size-4 text-emerald-500" />
        ) : (
          <Bot className="size-4 text-purple-500" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span
            className={cn(
              'text-sm font-medium',
              isUser ? 'text-emerald-500' : 'text-purple-500'
            )}
          >
            {isUser ? 'You' : 'Agent'}
          </span>
          <span className="text-xs text-muted-foreground/70 tabular-nums">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
          {message.message}
        </p>
      </div>
    </div>
  )
}

export function FeedbackHistory({
  messages,
  className,
  maxHeight = '300px',
}: FeedbackHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className={cn('p-6 text-center', className)}>
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <MessageSquare className="size-8 opacity-50" />
          <p className="text-sm">No feedback messages yet</p>
          <p className="text-xs opacity-70">
            Your conversation with the agent will appear here
          </p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea
      className={cn('px-1', className)}
      style={{ maxHeight }}
    >
      <div className="space-y-3 pr-3">
        {messages.map((message) => (
          <FeedbackMessageItem key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}

/**
 * Compact version of FeedbackHistory for smaller spaces
 */
export function FeedbackHistoryCompact({
  messages,
  className,
  maxItems = 3,
}: {
  messages: FeedbackMessage[]
  className?: string
  maxItems?: number
}) {
  const displayedMessages = messages.slice(-maxItems)
  const hiddenCount = messages.length - displayedMessages.length

  if (messages.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-2', className)}>
      {hiddenCount > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          +{hiddenCount} earlier message{hiddenCount > 1 ? 's' : ''}
        </p>
      )}
      {displayedMessages.map((message) => (
        <div
          key={message.id}
          className={cn(
            'flex items-start gap-2 p-2 rounded text-xs',
            message.type === 'user'
              ? 'bg-emerald-500/10'
              : 'bg-purple-500/10'
          )}
        >
          {message.type === 'user' ? (
            <User className="size-3 text-emerald-500 mt-0.5" />
          ) : (
            <Bot className="size-3 text-purple-500 mt-0.5" />
          )}
          <p className="text-foreground/80 line-clamp-2">{message.message}</p>
        </div>
      ))}
    </div>
  )
}
