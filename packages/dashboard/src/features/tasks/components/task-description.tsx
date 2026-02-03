'use client'

import { FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Task } from '../types'

interface TaskDescriptionProps {
  task: Task
}

export function TaskDescription({ task }: TaskDescriptionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5" />
          Description
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {task.description}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
