'use client'

import { useState, useEffect } from 'react'
import { Loader2, Play, Plus } from 'lucide-react'
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
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTaskUIStore } from '../stores/task-ui-store'
import { useCreateTask } from '../hooks/use-create-task'
import { taskKeys } from '../hooks/query-keys'
import { tasksApi } from '@/lib/api-client'
import { useRepoStore } from '@/features/repos/stores/repo-store'
import { useDetectedAgents } from '@/features/setup/hooks/use-detected-agents'
import { useSettings } from '@/features/setup/hooks/use-settings'
import { getAgentDisplayInfo } from '../utils/agent-display'

export function CreateTaskDialog() {
  const { isCreateModalOpen, closeCreateModal } = useTaskUIStore()
  const openDrawer = useTaskUIStore((state) => state.openDrawer)
  const createTaskMutation = useCreateTask()
  const queryClient = useQueryClient()
  const { selectedRepoId, selectedRepo } = useRepoStore()
  const { data: agents } = useDetectedAgents()
  const { data: settings } = useSettings()

  const [userInput, setUserInput] = useState('')
  const lastAgentType = useTaskUIStore((state) => state.lastAgentType)
  const lastAgentModel = useTaskUIStore((state) => state.lastAgentModel)
  const setLastAgent = useTaskUIStore((state) => state.setLastAgent)
  const [agentType, setAgentType] = useState<string>(lastAgentType ?? '')
  const [agentModel, setAgentModel] = useState<string>(lastAgentModel ?? '')
  const [isExecuting, setIsExecuting] = useState(false)

  // Agent derived values
  const installedAgents = (agents ?? []).filter((a) => a.installed)
  const selectedAgentData = installedAgents.find((a) => a.id === agentType)
  const selectedAgentModels = selectedAgentData?.models ?? []

  // Auto-select first installed agent if none selected
  useEffect(() => {
    if (!agentType && installedAgents.length > 0) {
      const defaultId = settings?.default_agent_type ?? installedAgents[0]?.id
      const agent = installedAgents.find((a) => a.id === defaultId) ?? installedAgents[0]
      if (agent) setAgentType(agent.id)
    }
  }, [agentType, installedAgents, settings?.default_agent_type])

  // Auto-select first model when agent changes and no model is selected
  useEffect(() => {
    if (selectedAgentModels.length > 0 && !selectedAgentModels.find((m) => m.id === agentModel)) {
      setAgentModel(selectedAgentModels[0].id)
    }
  }, [agentType, selectedAgentModels, agentModel])

  const buildTaskPayload = () => ({
    repository_id: selectedRepoId!,
    user_input: userInput.trim(),
    title: userInput.trim().slice(0, 100),
    description: userInput.trim(),
    repo_url: selectedRepo?.url || '',
    target_branch: selectedRepo?.default_branch || 'main',
    context_files: [] as string[],
    ...(agentType ? { agent_type: agentType as 'claude-code' | 'codex' | 'gemini' | 'openrouter' } : {}),
    ...(agentModel ? { agent_model: agentModel } : {}),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedRepoId || !selectedRepo) {
      toast.error('No repository selected. Please select a repository first.')
      return
    }

    try {
      await createTaskMutation.mutateAsync(buildTaskPayload())

      if (agentType) {
        setLastAgent(agentType, agentModel || null)
      }

      toast.success("Task created", {
        description: "The task is ready to execute.",
      });

      closeCreateModal()
      setUserInput('')
    } catch (error) {
      console.error('Failed to create task:', error)
      toast.error('Failed to create task', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  const handleCreateAndExecute = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRepoId || !selectedRepo) {
      toast.error("No repository selected. Please select a repository first.");
      return;
    }

    setIsExecuting(true);
    try {
      const task = await createTaskMutation.mutateAsync(buildTaskPayload());

      if (agentType) {
        setLastAgent(agentType, agentModel || null);
      }

      // Execute the task immediately
      await tasksApi.execute(task.id);

      // Invalidate queries so the board reflects the new status
      await queryClient.invalidateQueries({ queryKey: taskKeys.all });

      toast.success("Task created and executing", {
        description: "The agent is now working on your task.",
      });

      closeCreateModal();
      setUserInput("");

      // Open the task drawer so the user can follow progress
      openDrawer(task.id);
    } catch (error) {
      console.error("Failed to create & execute task:", error);
      toast.error("Failed to create & execute task", {
        description: error instanceof Error ? error.message : "An unexpected error occurred",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !createTaskMutation.isPending && !isExecuting) {
      closeCreateModal()
      setUserInput('')
    }
  }

  const isSubmitting = createTaskMutation.isPending || isExecuting

  return (
    <Dialog open={isCreateModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            New Task
          </DialogTitle>
          <DialogDescription>
            Describe what you need. The task will be created and you can start execution when ready.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
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
              The more detailed your description, the better the implementation. Include specific files, expected behavior, and edge cases if possible.
            </p>
          </div>

          {/* Agent & Model */}
          {installedAgents.length > 0 && (
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="agent-select" className="text-sm">Agent</Label>
                <Select
                  value={agentType}
                  onValueChange={(val) => {
                    setAgentType(val)
                    setAgentModel('')
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="agent-select" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {installedAgents.map((agent) => {
                      const info = getAgentDisplayInfo(agent.id)
                      return (
                        <SelectItem key={agent.id} value={agent.id}>
                          {info?.icon} {info?.name ?? agent.name}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {selectedAgentModels.length > 0 && (
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="model-select" className="text-sm">Model</Label>
                  <Select
                    value={agentModel}
                    onValueChange={setAgentModel}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="model-select" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedAgentModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="outline"
              disabled={!selectedRepoId || !userInput.trim() || isSubmitting}
            >
              {createTaskMutation.isPending && !isExecuting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Task
                </>
              )}
            </Button>
            <Button
              type="button"
              disabled={!selectedRepoId || !userInput.trim() || isSubmitting}
              onClick={handleCreateAndExecute}
            >
              {isExecuting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating & executing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Create & Execute
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
