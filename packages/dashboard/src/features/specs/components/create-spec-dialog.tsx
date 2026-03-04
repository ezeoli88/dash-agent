'use client'

import { useState, useEffect } from 'react'
import { Loader2, Play, Plus, FileText } from 'lucide-react'
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
import { useCreateTask } from '@/features/tasks/hooks/use-create-task'
import { useTaskUIStore } from '@/features/tasks/stores/task-ui-store'
import { taskKeys } from '@/features/tasks/hooks/query-keys'
import { tasksApi } from '@/lib/api-client'
import { useRepoStore } from '@/features/repos/stores/repo-store'
import { useDetectedAgents } from '@/features/setup/hooks/use-detected-agents'
import { useSettings } from '@/features/setup/hooks/use-settings'
import { getAgentDisplayInfo } from '@/features/tasks/utils/agent-display'
import { useSpecUIStore } from '../stores/spec-ui-store'

export function CreateSpecDialog() {
  const { isCreateOpen, closeCreate, openDetail } = useSpecUIStore()
  const createTask = useCreateTask()
  const queryClient = useQueryClient()
  const { selectedRepoId, selectedRepo } = useRepoStore()
  const { data: agents } = useDetectedAgents()
  const { data: settings } = useSettings()

  const [userInput, setUserInput] = useState('')
  const lastAgentType = useTaskUIStore((s) => s.lastAgentType)
  const lastAgentModel = useTaskUIStore((s) => s.lastAgentModel)
  const setLastAgent = useTaskUIStore((s) => s.setLastAgent)
  const [agentType, setAgentType] = useState<string>(lastAgentType ?? '')
  const [agentModel, setAgentModel] = useState<string>(lastAgentModel ?? '')
  const [isGenerating, setIsGenerating] = useState(false)

  const installedAgents = (agents ?? []).filter((a) => a.installed)
  const selectedAgentData = installedAgents.find((a) => a.id === agentType)
  const selectedAgentModels = selectedAgentData?.models ?? []

  // Auto-select agent
  useEffect(() => {
    if (!agentType && installedAgents.length > 0) {
      const defaultId = settings?.default_agent_type ?? installedAgents[0]?.id
      const agent = installedAgents.find((a) => a.id === defaultId) ?? installedAgents[0]
      if (agent) setAgentType(agent.id)
    }
  }, [agentType, installedAgents, settings?.default_agent_type])

  // Auto-select model
  useEffect(() => {
    if (selectedAgentModels.length > 0 && !selectedAgentModels.find((m) => m.id === agentModel)) {
      setAgentModel(selectedAgentModels[0].id)
    }
  }, [agentType, selectedAgentModels, agentModel])

  const buildPayload = () => ({
    repository_id: selectedRepoId!,
    user_input: userInput.trim(),
    title: userInput.trim().slice(0, 100),
    description: userInput.trim(),
    repo_url: selectedRepo?.url || '',
    target_branch: selectedRepo?.default_branch || 'main',
    context_files: [] as string[],
    ...(agentType ? { agent_type: agentType as 'claude-code' | 'codex' | 'gemini' | 'copilot' | 'openrouter' } : {}),
    ...(agentModel ? { agent_model: agentModel } : {}),
  })

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRepoId || !selectedRepo) {
      toast.error('No repository selected.')
      return
    }

    try {
      const task = await createTask.mutateAsync(buildPayload())
      if (agentType) setLastAgent(agentType, agentModel || null)
      toast.success('Draft spec created')
      closeCreate()
      setUserInput('')
      openDetail(task.id)
    } catch (error) {
      toast.error('Failed to create spec', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  const handleGenerateSpec = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRepoId || !selectedRepo) {
      toast.error('No repository selected.')
      return
    }

    setIsGenerating(true)
    try {
      const task = await createTask.mutateAsync(buildPayload())
      if (agentType) setLastAgent(agentType, agentModel || null)

      await tasksApi.start(task.id)
      await queryClient.invalidateQueries({ queryKey: taskKeys.all })

      toast.success('Spec generation started')
      closeCreate()
      setUserInput('')
      openDetail(task.id)
    } catch (error) {
      toast.error('Failed to create & generate spec', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open && !createTask.isPending && !isGenerating) {
      closeCreate()
      setUserInput('')
    }
  }

  const isSubmitting = createTask.isPending || isGenerating

  return (
    <Dialog open={isCreateOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            New Specification
          </DialogTitle>
          <DialogDescription>
            Describe your idea. You can save it as a draft or generate a detailed spec immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSaveDraft} className="space-y-6 pt-2">
          {/* User Input */}
          <div className="space-y-2">
            <Label htmlFor="spec-input">Describe your idea</Label>
            <Textarea
              id="spec-input"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="e.g., Add a user profile page with avatar upload and settings"
              className="min-h-[120px] resize-none"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Be as detailed as possible. Include expected behavior, edge cases, and specific requirements.
            </p>
          </div>

          {/* Agent & Model */}
          {installedAgents.length > 0 && (
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="spec-agent-select" className="text-sm">Agent</Label>
                <Select
                  value={agentType}
                  onValueChange={(val) => {
                    setAgentType(val)
                    setAgentModel('')
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="spec-agent-select" className="w-full">
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
                  <Label htmlFor="spec-model-select" className="text-sm">Model</Label>
                  <Select
                    value={agentModel}
                    onValueChange={setAgentModel}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="spec-model-select" className="w-full">
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
              {createTask.isPending && !isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Save Draft
                </>
              )}
            </Button>
            <Button
              type="button"
              disabled={!selectedRepoId || !userInput.trim() || isSubmitting}
              onClick={handleGenerateSpec}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
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
