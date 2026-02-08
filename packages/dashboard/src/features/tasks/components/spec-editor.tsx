'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Play, Pencil, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { Task } from '../types'
import { useUpdateSpec } from '../hooks/use-update-spec'
import { useRegenerateSpec } from '../hooks/use-generate-spec'
import { useApproveSpec } from '../hooks/use-approve-spec'

interface SpecEditorProps {
  task: Task
  hideActions?: boolean
}

export function SpecEditor({ task, hideActions }: SpecEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedSpec, setEditedSpec] = useState(task.generated_spec || task.final_spec || '')

  const updateSpecMutation = useUpdateSpec()
  const regenerateSpecMutation = useRegenerateSpec()
  const approveSpecMutation = useApproveSpec()

  // Sync local state when task changes
  useEffect(() => {
    setEditedSpec(task.generated_spec || task.final_spec || '')
  }, [task.generated_spec, task.final_spec])

  const currentSpec = task.final_spec || task.generated_spec || ''
  const hasChanges = editedSpec !== currentSpec

  const handleSaveEdit = async () => {
    try {
      await updateSpecMutation.mutateAsync({
        taskId: task.id,
        spec: editedSpec,
      })
      setIsEditing(false)
      toast.success('Spec updated')
    } catch (error) {
      toast.error('Failed to update spec', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handleCancelEdit = () => {
    setEditedSpec(currentSpec)
    setIsEditing(false)
  }

  const handleRegenerate = async () => {
    try {
      await regenerateSpecMutation.mutateAsync({
        taskId: task.id,
      })
      toast.info('Regenerating spec...', {
        description: 'PM Agent is generating a new specification.',
      })
    } catch (error) {
      toast.error('Failed to regenerate spec', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handleApprove = async () => {
    try {
      // If there are unsaved edits, include them in the approval
      const finalSpec = hasChanges ? editedSpec : undefined

      await approveSpecMutation.mutateAsync({
        taskId: task.id,
        finalSpec,
      })
      toast.success('Spec approved!', {
        description: 'Dev Agent will start working on the implementation.',
      })
    } catch (error) {
      toast.error('Failed to approve spec', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const isLoading = updateSpecMutation.isPending || regenerateSpecMutation.isPending || approveSpecMutation.isPending

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            disabled={isLoading}
          >
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {isEditing ? (
          <>
            <Textarea
              value={editedSpec}
              onChange={(e) => setEditedSpec(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
              placeholder="Edit the specification..."
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelEdit}
                disabled={updateSpecMutation.isPending}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={!hasChanges || updateSpecMutation.isPending}
              >
                {updateSpecMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Save Changes
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-md border bg-muted/30 p-4 min-h-[300px] max-h-[500px] overflow-auto">
              <pre className="whitespace-pre-wrap font-mono text-sm">
                {currentSpec || 'No specification generated yet.'}
              </pre>
            </div>

            {!hideActions && (
              <div className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handleRegenerate}
                  disabled={isLoading}
                >
                  {regenerateSpecMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Regenerate
                </Button>

                <Button
                  onClick={handleApprove}
                  disabled={isLoading || !currentSpec}
                >
                  {approveSpecMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Approve & Execute
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
