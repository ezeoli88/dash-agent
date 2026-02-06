'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import type { ConnectionStatus as ConnectionStatusType } from '../hooks/use-task-sse'

interface ConnectionStatusProps {
  status: ConnectionStatusType
  agentName?: string | null
  onReconnect?: () => void
  className?: string
}

const STATUS_CONFIG: Record<ConnectionStatusType, {
  dotClass: string
  label: string
  showReconnect: boolean
}> = {
  connecting: {
    dotClass: 'bg-amber-500 animate-pulse',
    label: 'Connecting...',
    showReconnect: false,
  },
  connected: {
    dotClass: 'bg-green-500',
    label: 'Connected',
    showReconnect: false,
  },
  disconnected: {
    dotClass: 'bg-gray-400',
    label: 'Disconnected',
    showReconnect: true,
  },
  error: {
    dotClass: 'bg-red-500',
    label: 'Connection error',
    showReconnect: true,
  },
}

export function ConnectionStatus({ status, agentName, onReconnect, className }: ConnectionStatusProps) {
  const config = STATUS_CONFIG[status]

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center gap-1.5">
        <span className={cn('size-2 rounded-full', config.dotClass)} />
        <span className="text-xs text-muted-foreground">
          {agentName ? `${agentName} \u2014 ${config.label}` : config.label}
        </span>
      </div>

      {config.showReconnect && onReconnect && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onReconnect}
          title="Reconnect"
        >
          <RefreshCw className="size-3" />
        </Button>
      )}
    </div>
  )
}
