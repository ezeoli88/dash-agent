'use client'

import { TaskLogs } from '@/features/tasks/components/task-logs'
import type { Task } from '@/features/tasks/types'

interface SpecGenerationProgressProps {
  task: Task
  className?: string
}

export function SpecGenerationProgress({ task, className }: SpecGenerationProgressProps) {
  return (
    <TaskLogs
      task={task}
      enabled={task.status === 'refining'}
      showFeedbackForm={false}
      className={className}
    />
  )
}
