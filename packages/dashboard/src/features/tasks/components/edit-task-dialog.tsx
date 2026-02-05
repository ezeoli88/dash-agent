'use client'

import { useState, useEffect } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useUpdateTask } from '../hooks/use-update-task'
import type { Task } from '../types'

interface EditTaskDialogProps {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditTaskDialog({ task, open, onOpenChange }: EditTaskDialogProps) {
  const updateTaskMutation = useUpdateTask(task.id)
  const [userInput, setUserInput] = useState(task.user_input || task.description || '')

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setUserInput(task.user_input || task.description || '')
    }
  }, [open, task.user_input, task.description])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!userInput.trim() || userInput.trim().length < 10) {
      toast.error('Please describe what you need', {
        description: 'Description must be at least 10 characters',
      })
      return
    }

    try {
      await updateTaskMutation.mutateAsync({
        user_input: userInput.trim(),
        title: userInput.trim().slice(0, 100),
        description: userInput.trim(),
      })

      toast.success('Task updated')
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to update task:', error)
      toast.error('Failed to update task', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !updateTaskMutation.isPending) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Edit Task
          </DialogTitle>
          <DialogDescription>
            Update your task description before generating the spec.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          <div className="space-y-2">
            <Label htmlFor="user-input">What do you need?</Label>
            <Textarea
              id="user-input"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="e.g., Add a date filter to the transactions list"
              className="min-h-[120px] resize-none"
              disabled={updateTaskMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Describe your idea in simple terms (min. 10 characters). The PM Agent will analyze the repository and create a detailed technical specification.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={updateTaskMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={userInput.trim().length < 10 || updateTaskMutation.isPending}
            >
              {updateTaskMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
