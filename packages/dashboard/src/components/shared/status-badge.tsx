import { Badge } from '@/components/ui/badge'
import type { TaskStatus } from '@/features/tasks/types'

const STATUS_CONFIG: Record<
  TaskStatus,
  {
    label: string
    variant:
      | 'default'
      | 'secondary'
      | 'destructive'
      | 'outline'
      | 'warning'
      | 'success'
      | 'purple'
      | 'indigo'
      | 'orange'
  }
> = {
  backlog: { label: 'Backlog', variant: 'secondary' },
  planning: { label: 'Planning', variant: 'default' },
  in_progress: { label: 'In Progress', variant: 'warning' },
  awaiting_review: { label: 'Awaiting Review', variant: 'purple' },
  approved: { label: 'Approved', variant: 'success' },
  pr_created: { label: 'PR Created', variant: 'indigo' },
  changes_requested: { label: 'Changes Requested', variant: 'orange' },
  done: { label: 'Done', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
}

interface StatusBadgeProps {
  status: TaskStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  // Defensive check for invalid status values
  const config = STATUS_CONFIG[status]
  if (!config) {
    console.error(`StatusBadge: Unknown status "${status}"`)
    return (
      <Badge variant="secondary" className={className}>
        {status || 'Unknown'}
      </Badge>
    )
  }
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  )
}
