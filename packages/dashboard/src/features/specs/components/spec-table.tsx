'use client'

import { FileText } from 'lucide-react'
import { SpecTableRow } from './spec-table-row'
import type { Task } from '@/features/tasks/types'

interface SpecTableProps {
  tasks: Task[]
  onGenerate?: (taskId: string) => void
}

export function SpecTable({ tasks, onGenerate }: SpecTableProps) {
  const sorted = [...tasks].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FileText className="size-12 mb-3 opacity-40" />
        <p className="text-sm font-medium">No specs yet</p>
        <p className="text-xs mt-1">Create one to get started.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sorted.map((task) => (
        <SpecTableRow key={task.id} task={task} onGenerate={onGenerate} />
      ))}
    </div>
  )
}
