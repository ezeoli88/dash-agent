'use client'

import Link from 'next/link'
import { ArrowLeft, ExternalLink, AlertCircle, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { extractRepoName } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import { getAgentDisplayInfo, getAgentLabel } from '../utils/agent-display'
import type { Task } from '../types'

interface TaskHeaderProps {
  task: Task
}

export function TaskHeader({ task }: TaskHeaderProps) {
  const repoName = extractRepoName(task.repo_url)
  const agentInfo = getAgentDisplayInfo(task.agent_type)

  return (
    <div className="space-y-4">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/tasks" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Tasks
        </Link>
      </Button>

      {/* Title and status row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            {task.title}
          </h1>
          <div className="flex items-center gap-3">
            <StatusBadge status={task.status} />
            <a
              href={task.repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {repoName}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {task.agent_type && (
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                agentInfo?.colorClasses.bg ?? 'bg-muted',
                agentInfo?.colorClasses.text ?? 'text-muted-foreground'
              )}>
                <Terminal className="size-3" />
                {getAgentLabel(task.agent_type, task.agent_model)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error message */}
      {task.error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{task.error}</span>
        </div>
      )}
    </div>
  )
}
