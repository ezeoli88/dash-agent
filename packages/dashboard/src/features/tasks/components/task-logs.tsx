'use client'

import { useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Trash2, ArrowDownToLine } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useTaskUIStore } from '../stores/task-ui-store'
import { useTaskSSE } from '../hooks/use-task-sse'
import { LogEntry, LogEntryHighlighted } from './log-entry'
import { ConnectionStatus } from './connection-status'
import { FeedbackForm } from './feedback-form'
import { getAgentDisplayInfo, getAgentLabel } from '../utils/agent-display'
import type { Task } from '../types'

interface TaskLogsProps {
  task: Task
  enabled?: boolean
  className?: string
  /**
   * Whether to show the integrated feedback form below the logs
   */
  showFeedbackForm?: boolean
}

export function TaskLogs({
  task,
  enabled = true,
  className,
  showFeedbackForm = true,
}: TaskLogsProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { isAutoScrollEnabled, toggleAutoScroll } = useTaskUIStore()
  const agentInfo = getAgentDisplayInfo(task.agent_type)
  const agentLabel = getAgentLabel(task.agent_type, task.agent_model)

  // Determine if logs should be active
  const isActiveTask = task.status === 'planning' || task.status === 'in_progress' || task.status === 'refining'
  const shouldConnect = enabled && isActiveTask

  // Use real SSE connection
  const sse = useTaskSSE({
    taskId: task.id,
    enabled: shouldConnect,
    onStatusChange: (status) => {
      console.log('Status changed:', status)
    },
    onComplete: (prUrl) => {
      toast.success('Task completed!', {
        description: prUrl ? `PR available at: ${prUrl}` : 'Task finished successfully',
      })
    },
    onError: (message) => {
      toast.error('Task error', {
        description: message,
      })
    },
    onTimeoutWarning: (message) => {
      toast.warning('Timeout warning', {
        description: message,
      })
    },
  })

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isAutoScrollEnabled && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [sse.logs, isAutoScrollEnabled])

  // Copy all logs to clipboard
  const handleCopyLogs = useCallback(() => {
    const logText = sse.logs
      .map((log) => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n')

    navigator.clipboard.writeText(logText).then(() => {
      toast.success('Logs copied to clipboard')
    }).catch(() => {
      toast.error('Failed to copy logs')
    })
  }, [sse.logs])

  // Clear all logs
  const handleClearLogs = useCallback(() => {
    sse.clearLogs()
    toast.info('Logs cleared')
  }, [sse])

  // Handle feedback sent - add to logs
  const handleFeedbackSent = useCallback((message: string) => {
    // Add the user log entry to show in the log stream
    sse.addLog({
      timestamp: new Date().toISOString(),
      level: 'user',
      message: message,
    })
  }, [sse])

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <ConnectionStatus
          status={sse.connectionStatus}
          agentName={agentInfo?.name}
          onReconnect={sse.reconnect}
        />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggleAutoScroll}
            title={isAutoScrollEnabled ? 'Disable auto-scroll' : 'Enable auto-scroll'}
            className={cn(
              isAutoScrollEnabled && 'bg-muted'
            )}
          >
            <ArrowDownToLine className="size-3" />
          </Button>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopyLogs}
            title="Copy logs"
            disabled={sse.logs.length === 0}
          >
            <Copy className="size-3" />
          </Button>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleClearLogs}
            title="Clear logs"
            disabled={sse.logs.length === 0}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {/* Log content - always dark background (terminal style) */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto bg-zinc-900 dark:bg-zinc-950"
      >
        <div className="p-2">
          {sse.logs.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-zinc-400">
              <div className="text-center">
                <p className="text-sm">No logs yet</p>
                {isActiveTask ? (
                  <p className="text-xs mt-1 text-zinc-500">
                    Waiting for {agentLabel ?? 'agent'} output...
                  </p>
                ) : (
                  <p className="text-xs mt-1 text-zinc-500">Execute the task to see logs</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {sse.logs.map((entry) => (
                entry.level === 'user' ? (
                  <LogEntryHighlighted key={entry.id} entry={entry} />
                ) : (
                  <LogEntry key={entry.id} entry={entry} />
                )
              ))}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Integrated Feedback Form */}
      {showFeedbackForm && isActiveTask && (
        <div className="border-t bg-muted/20 p-3">
          <FeedbackForm
            task={task}
            onFeedbackSent={handleFeedbackSent}
          />
        </div>
      )}
    </div>
  )
}
