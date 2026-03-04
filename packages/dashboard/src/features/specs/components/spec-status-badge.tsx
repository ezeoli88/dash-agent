'use client'

import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { TaskStatus } from '@/features/tasks/types'

const STATUS_CONFIG: Record<string, { label: string; variant: 'secondary' | 'default' | 'warning' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  refining: { label: 'Generating...', variant: 'default' },
  pending_approval: { label: 'Ready for Review', variant: 'warning' },
}

interface SpecStatusBadgeProps {
  status: TaskStatus
  className?: string
}

export function SpecStatusBadge({ status, className }: SpecStatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  if (!config) return null

  return (
    <Badge variant={config.variant} className={className}>
      {status === 'refining' && <Loader2 className="size-3 mr-1 animate-spin" />}
      {config.label}
    </Badge>
  )
}
