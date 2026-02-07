'use client'

import { useState } from 'react'
import { FileText, RotateCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { isTerminalStatus, isActiveStatus } from '../types'
import { useUpdateTask } from '../hooks/use-update-task'
import { useRegenerateSpec, useGenerateSpec } from '../hooks/use-generate-spec'
import { InlineEdit } from './inline-edit'
import type { Task } from '../types'

interface TaskDescriptionProps {
  task: Task
  /** Whether to show the Rebuild Spec button */
  showRebuildSpec?: boolean
}

export function TaskDescription({ task, showRebuildSpec = false }: TaskDescriptionProps) {
  const updateTaskMutation = useUpdateTask(task.id)
  const regenerateSpecMutation = useRegenerateSpec()
  const generateSpecMutation = useGenerateSpec()

  // Track whether the description was edited since last spec generation
  const [descriptionEdited, setDescriptionEdited] = useState(false)

  // Description is editable only when the task is in an early/non-active state
  const isEditable = !isTerminalStatus(task.status) && !isActiveStatus(task.status)

  // Determine if we can rebuild the spec:
  // - pending_approval: use regenerate-spec endpoint
  // - draft with an existing spec: use generate-spec endpoint
  const canRebuildSpec =
    showRebuildSpec &&
    (task.status === 'pending_approval' ||
      (task.status === 'draft' && !!(task.generated_spec || task.final_spec)))

  const isRebuilding = regenerateSpecMutation.isPending || generateSpecMutation.isPending

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

  const handleRebuildSpec = async () => {
    try {
      if (task.status === 'pending_approval') {
        await regenerateSpecMutation.mutateAsync({ taskId: task.id })
      } else {
        await generateSpecMutation.mutateAsync({ taskId: task.id })
      }
      setDescriptionEdited(false)
      toast.info('Rebuilding spec...', {
        description: 'PM Agent is regenerating the specification based on the updated description.',
      })
    } catch (error) {
      toast.error('Failed to rebuild spec', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
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

        {canRebuildSpec && (
          <div className="flex items-center gap-3 pt-1">
            <Button
              variant={descriptionEdited ? 'default' : 'outline'}
              size="sm"
              onClick={handleRebuildSpec}
              disabled={isRebuilding || updateTaskMutation.isPending}
            >
              {isRebuilding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4" />
              )}
              {isRebuilding ? 'Rebuilding...' : 'Rebuild Spec'}
            </Button>
            {descriptionEdited && (
              <span className="text-xs text-muted-foreground">
                Description was updated. Rebuild the spec to reflect the changes.
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
