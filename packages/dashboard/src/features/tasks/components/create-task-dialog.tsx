'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useTaskUIStore } from '../stores/task-ui-store'
import { useCreateTask } from '../hooks/use-create-task'
import { useGenerateSpec } from '../hooks/use-generate-spec'
import { useRepos } from '@/features/repos/hooks/use-repos'

export function CreateTaskDialog() {
  const router = useRouter()
  const { isCreateModalOpen, closeCreateModal } = useTaskUIStore()
  const createTaskMutation = useCreateTask()
  const generateSpecMutation = useGenerateSpec()
  const { data: repos, isLoading: reposLoading } = useRepos()

  const [repositoryId, setRepositoryId] = useState<string>('')
  const [userInput, setUserInput] = useState('')

  const selectedRepo = repos?.find((r) => r.id === repositoryId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!repositoryId) {
      toast.error('Please select a repository')
      return
    }

    if (!userInput.trim()) {
      toast.error('Please describe what you need')
      return
    }

    try {
      // Create task in draft status
      const task = await createTaskMutation.mutateAsync({
        repository_id: repositoryId,
        user_input: userInput.trim(),
        // Provide legacy fields with defaults based on repo
        title: userInput.trim().slice(0, 100),
        description: userInput.trim(),
        repo_url: selectedRepo?.url || '',
        target_branch: selectedRepo?.default_branch || 'main',
        context_files: [],
      })

      toast.success('Task created', {
        description: 'Generating specification...',
      })

      // Immediately trigger spec generation
      try {
        await generateSpecMutation.mutateAsync({
          taskId: task.id,
        })
      } catch (specError) {
        // Task was created but spec generation failed
        toast.error('Spec generation started but may have issues', {
          description: specError instanceof Error ? specError.message : 'Check the task for details',
        })
      }

      closeCreateModal()
      setRepositoryId('')
      setUserInput('')

      // Navigate to the new task
      router.push(`/tasks/${task.id}`)
    } catch (error) {
      console.error('Failed to create task:', error)
      toast.error('Failed to create task', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open && !createTaskMutation.isPending && !generateSpecMutation.isPending) {
      closeCreateModal()
      setRepositoryId('')
      setUserInput('')
    }
  }

  const isSubmitting = createTaskMutation.isPending || generateSpecMutation.isPending

  return (
    <Dialog open={isCreateModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            New Task
          </DialogTitle>
          <DialogDescription>
            Describe what you need and the PM Agent will create a detailed specification for you to review.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {/* Repository Selection */}
          <div className="space-y-2">
            <Label htmlFor="repository">Repository</Label>
            <Select
              value={repositoryId}
              onValueChange={setRepositoryId}
              disabled={reposLoading || isSubmitting}
            >
              <SelectTrigger id="repository" className="w-full">
                <SelectValue placeholder="Select a repository" />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-3rem)] sm:max-w-[468px]">
                {repos?.map((repo) => (
                  <SelectItem key={repo.id} value={repo.id}>
                    <span className="truncate">{repo.name}</span>
                    {repo.detected_stack?.framework && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        ({repo.detected_stack.framework})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {repos?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No repositories added yet. Add a repository first.
              </p>
            )}
          </div>

          {/* User Input */}
          <div className="space-y-2">
            <Label htmlFor="user-input">What do you need?</Label>
            <Textarea
              id="user-input"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="e.g., Add a date filter to the transactions list"
              className="min-h-[120px] resize-none"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Describe your idea in simple terms. The PM Agent will analyze the repository and create a detailed technical specification.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!repositoryId || !userInput.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Spec
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
