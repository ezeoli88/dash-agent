'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TaskForm } from './task-form'
import { useTaskUIStore } from '../stores/task-ui-store'
import { useCreateTask } from '../hooks/use-create-task'
import { toast } from 'sonner'
import type { CreateTaskFormData } from '../schemas/task.schema'

export function TaskFormDialog() {
  const { isCreateModalOpen, closeCreateModal } = useTaskUIStore()
  const createTaskMutation = useCreateTask()

  const handleSubmit = async (data: CreateTaskFormData) => {
    try {
      await createTaskMutation.mutateAsync({
        title: data.title,
        description: data.description,
        repo_url: data.repo_url,
        target_branch: data.target_branch,
        context_files: data.context_files,
        build_command: data.build_command,
      })

      toast.success('Task created', {
        description: 'Your task has been created successfully.',
      })

      closeCreateModal()
    } catch (error) {
      console.error('Failed to create task:', error)
      toast.error('Failed to create task', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open && !createTaskMutation.isPending) {
      closeCreateModal()
    }
  }

  return (
    <Dialog open={isCreateModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>
            Define a new task for the AI agent to work on. Provide as much context as possible for better results.
          </DialogDescription>
        </DialogHeader>
        <TaskForm
          onSubmit={handleSubmit}
          onCancel={closeCreateModal}
          isSubmitting={createTaskMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  )
}
