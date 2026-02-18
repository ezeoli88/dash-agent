'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { isTerminalStatus, isActiveStatus } from '../types'
import { useUpdateTask } from '../hooks/use-update-task'
import { InlineEdit } from './inline-edit'
import type { Task } from '../types'

interface TaskDescriptionProps {
  task: Task
  /** Whether to show the Rebuild Spec button */
  showRebuildSpec?: boolean
}

export function TaskDescription({ task, showRebuildSpec = false }: TaskDescriptionProps) {
  const updateTaskMutation = useUpdateTask(task.id)

  // Track whether the description was edited
  const [descriptionEdited, setDescriptionEdited] = useState(false)

  // Description is editable only when the task is in an early/non-active state
  const isEditable = !isTerminalStatus(task.status) && !isActiveStatus(task.status)

  // Rebuild Spec button is now disabled since PM Agent is deprecated
  const canRebuildSpec = false

  const handleSaveDescription = async (newDescription: string) => {
    try {
      await updateTaskMutation.mutateAsync({
        description: newDescription,
        // Also update user_input since some workflows rely on it
        user_input: newDescription,
      })
      setDescriptionEdited(true)
      toast.success('Description updated')
    } catch (error) {
      console.error('Failed to update description:', error)
      toast.error('Failed to update description', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
      throw error // re-throw so InlineEdit stays in edit mode
    }
  }


  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5" />
          Description
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <InlineEdit
            value={task.description}
            onSave={handleSaveDescription}
            isSaving={updateTaskMutation.isPending}
            disabled={!isEditable}
            multiline
            minLength={1}
            placeholder="Click to add a description..."
            displayClassName="text-sm leading-relaxed text-foreground whitespace-pre-wrap"
            inputClassName="text-sm"
          />
        </div>

      </CardContent>
    </Card>
  )
}
