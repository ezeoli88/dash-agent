'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { generateId } from '@/lib/utils'
import type { ChatMessageEvent, ToolActivityEvent } from '@dash-agent/shared'
import { useTaskSSE } from './use-task-sse'
import type { TaskStatus } from '../types'

export interface ChatEntry {
  type: 'message' | 'tool'
  data: ChatMessageEvent | ToolActivityEvent
}

interface UseTaskChatOptions {
  taskId: string
  enabled: boolean
  taskStatus?: string
  onStatusChange?: (status: TaskStatus) => void
  onComplete?: (prUrl?: string) => void
  onError?: (message: string) => void
}

export function useTaskChat(options: UseTaskChatOptions) {
  const [entries, setEntries] = useState<ChatEntry[]>([])

  const handleChatMessage = useCallback((event: ChatMessageEvent) => {
    setEntries(prev => [...prev, { type: 'message', data: event }])
  }, [])

  const handleToolActivity = useCallback((event: ToolActivityEvent) => {
    setEntries(prev => {
      // If an entry with this tool id already exists, update its status
      const existingIndex = prev.findIndex(
        e => e.type === 'tool' && (e.data as ToolActivityEvent).id === event.id && event.id !== ''
      )
      if (existingIndex >= 0) {
        const updated = [...prev]
        const existing = prev[existingIndex].data as ToolActivityEvent
        // Merge: preserve name and summary from the original tool_use event
        // tool_result events come with name='' and summary='done', which would wipe useful info
        updated[existingIndex] = {
          type: 'tool',
          data: {
            ...existing,
            status: event.status,
            name: event.name || existing.name,
            summary: event.status === 'error' ? (event.summary || existing.summary) : existing.summary,
          },
        }
        return updated
      }
      return [...prev, { type: 'tool', data: event }]
    })
  }, [])

  const sse = useTaskSSE({
    taskId: options.taskId,
    enabled: options.enabled,
    onChatMessage: handleChatMessage,
    onToolActivity: handleToolActivity,
    onStatusChange: options.onStatusChange,
    onComplete: options.onComplete,
    onError: options.onError,
  })

  // Reconnect SSE when task transitions from terminal → active (e.g., retry)
  const prevStatusRef = useRef(options.taskStatus)
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = options.taskStatus

    const TERMINAL = ['done', 'failed', 'canceled']
    if (prev && TERMINAL.includes(prev) && options.taskStatus && !TERMINAL.includes(options.taskStatus) && options.taskStatus !== 'draft') {
      setEntries([])
      sse.reconnect()
    }
  }, [options.taskStatus, sse])

  const addUserMessage = useCallback((content: string) => {
    const event: ChatMessageEvent = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    setEntries(prev => [...prev, { type: 'message', data: event }])
  }, [])

  return {
    entries,
    isConnected: sse.connectionStatus === 'connected',
    status: sse.connectionStatus,
    clearEntries: () => setEntries([]),
    addUserMessage,
  }
}
