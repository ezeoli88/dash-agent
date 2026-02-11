'use client'

import { useState, useCallback } from 'react'
import { MessageSquarePlus, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn, generateId } from '@/lib/utils'
import { FeedbackForm } from './feedback-form'
import { FeedbackHistory, type FeedbackMessage } from './feedback-history'
import type { Task, LogEntry } from '../types'

interface FeedbackSectionProps {
  task: Task
  className?: string
  /**
   * Callback when feedback is sent. Returns the message content.
   * Use this to add the feedback to the logs.
   */
  onFeedbackSent?: (message: string) => LogEntry
  /**
   * Initial collapsed state. Default: false (expanded)
   */
  defaultCollapsed?: boolean
}

/**
 * FeedbackSection component combines the FeedbackForm and FeedbackHistory
 * into a cohesive section for agent communication.
 */
export function FeedbackSection({
  task,
  className,
  onFeedbackSent,
  defaultCollapsed = false,
}: FeedbackSectionProps) {
  const [messages, setMessages] = useState<FeedbackMessage[]>([])
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)

  // Check if task is in an active state that allows feedback
  const isActiveTask = task.status === 'planning' || task.status === 'in_progress'

  const handleFeedbackSent = useCallback((messageText: string) => {
    // Add user message to history
    const userMessage: FeedbackMessage = {
      id: generateId(),
      type: 'user',
      message: messageText,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])

    // Notify parent (for adding to logs)
    if (onFeedbackSent) {
      onFeedbackSent(messageText)
    }
  }, [onFeedbackSent])

  // Don't render if task is not in active state
  if (!isActiveTask) {
    return null
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquarePlus className="size-5 text-primary" />
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Send Feedback to Agent
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-xs" className="text-muted-foreground">
                        <HelpCircle className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <p>
                        Send messages to guide the agent while it works on your task.
                        You can provide clarifications, change priorities, or ask questions.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
                <CardDescription className="text-xs">
                  Communicate with the agent during task execution
                </CardDescription>
              </div>
            </div>

            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {isCollapsed ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronUp className="size-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Feedback History */}
            {messages.length > 0 && (
              <div className="border-b pb-4">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  Conversation History
                </h4>
                <FeedbackHistory messages={messages} maxHeight="200px" />
              </div>
            )}

            {/* Feedback Form */}
            <FeedbackForm
              task={task}
              onFeedbackSent={handleFeedbackSent}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

/**
 * Standalone version of FeedbackSection without the card wrapper.
 * Useful when embedding in existing cards or layouts.
 */
export function FeedbackSectionInline({
  task,
  className,
  onFeedbackSent,
}: Omit<FeedbackSectionProps, 'defaultCollapsed'>) {
  const [messages, setMessages] = useState<FeedbackMessage[]>([])

  const isActiveTask = task.status === 'planning' || task.status === 'in_progress'

  const handleFeedbackSent = useCallback((messageText: string) => {
    const userMessage: FeedbackMessage = {
      id: generateId(),
      type: 'user',
      message: messageText,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])

    if (onFeedbackSent) {
      onFeedbackSent(messageText)
    }
  }, [onFeedbackSent])

  if (!isActiveTask) {
    return null
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <MessageSquarePlus className="size-4 text-primary" />
        <h3 className="text-sm font-medium">Send Feedback to Agent</h3>
      </div>

      {/* Feedback History */}
      {messages.length > 0 && (
        <FeedbackHistory messages={messages} maxHeight="150px" />
      )}

      {/* Feedback Form */}
      <FeedbackForm
        task={task}
        onFeedbackSent={handleFeedbackSent}
      />
    </div>
  )
}
