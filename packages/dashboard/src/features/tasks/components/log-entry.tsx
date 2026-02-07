'use client'

import { Info, AlertTriangle, XCircle, Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LogEntry as LogEntryType, LogLevel } from '../types'

interface LogEntryProps {
  entry: LogEntryType
}

const LOG_LEVEL_CONFIG: Record<LogLevel, {
  icon: typeof Info
  className: string
  label: string
}> = {
  info: {
    icon: Info,
    className: 'text-zinc-400',
    label: 'INFO',
  },
  debug: {
    icon: Info,
    className: 'text-zinc-500',
    label: 'DEBUG',
  },
  warn: {
    icon: AlertTriangle,
    className: 'text-amber-500',
    label: 'WARN',
  },
  error: {
    icon: XCircle,
    className: 'text-red-500',
    label: 'ERROR',
  },
  agent: {
    icon: Bot,
    className: 'text-purple-400',
    label: 'AGENT',
  },
  user: {
    icon: User,
    className: 'text-emerald-400',
    label: 'YOU',
  },
}

const DEFAULT_CONFIG = {
  icon: Info,
  className: 'text-zinc-400',
  label: 'LOG',
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return timestamp
  }
}

export function LogEntry({ entry }: LogEntryProps) {
  const config = LOG_LEVEL_CONFIG[entry.level] ?? DEFAULT_CONFIG
  const Icon = config.icon

  return (
    <div className="flex items-start gap-2 py-1 px-2 hover:bg-white/5 rounded group">
      {/* Timestamp */}
      <span className="text-xs text-zinc-500 font-mono shrink-0 tabular-nums">
        {formatTimestamp(entry.timestamp)}
      </span>

      {/* Level indicator */}
      <div className={cn('flex items-center gap-1 shrink-0', config.className)}>
        <Icon className="size-3.5" />
        <span className="text-xs font-semibold uppercase tracking-wide w-12">
          {config.label}
        </span>
      </div>

      {/* Message */}
      <span className={cn(
        'text-sm font-mono break-all text-zinc-200',
        entry.level === 'error' && 'text-red-400',
        entry.level === 'warn' && 'text-amber-400',
        entry.level === 'agent' && 'text-purple-300',
        entry.level === 'user' && 'text-emerald-300'
      )}>
        {entry.message}
      </span>
    </div>
  )
}

/**
 * Variant of LogEntry with background highlighting for user messages
 */
export function LogEntryHighlighted({ entry }: LogEntryProps) {
  const config = LOG_LEVEL_CONFIG[entry.level] ?? DEFAULT_CONFIG
  const Icon = config.icon
  const isUserMessage = entry.level === 'user'

  return (
    <div className={cn(
      'flex items-start gap-2 py-1.5 px-2 rounded group',
      isUserMessage
        ? 'bg-emerald-500/10 border border-emerald-500/20'
        : 'hover:bg-white/5'
    )}>
      {/* Timestamp */}
      <span className="text-xs text-zinc-500 font-mono shrink-0 tabular-nums">
        {formatTimestamp(entry.timestamp)}
      </span>

      {/* Level indicator */}
      <div className={cn('flex items-center gap-1 shrink-0', config.className)}>
        <Icon className="size-3.5" />
        <span className="text-xs font-semibold uppercase tracking-wide w-12">
          {config.label}
        </span>
      </div>

      {/* Message */}
      <span className={cn(
        'text-sm font-mono break-all text-zinc-200',
        entry.level === 'error' && 'text-red-400',
        entry.level === 'warn' && 'text-amber-400',
        entry.level === 'agent' && 'text-purple-300',
        entry.level === 'user' && 'text-emerald-300 font-medium'
      )}>
        {entry.message}
      </span>
    </div>
  )
}
