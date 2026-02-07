'use client'

import { useState } from 'react'
import { Loader2, Plus, Terminal, ChevronDown } from 'lucide-react'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { toast } from 'sonner'
import { useTaskUIStore } from '../stores/task-ui-store'
import { useCreateTask } from '../hooks/use-create-task'
import { useRepos } from '@/features/repos/hooks/use-repos'
import { useDetectedAgents } from '@/features/setup/hooks/use-detected-agents'
import { useSettings } from '@/features/setup/hooks/use-settings'
import { getAgentDisplayInfo } from '../utils/agent-display'

export function CreateTaskDialog() {
  const { isCreateModalOpen, closeCreateModal } = useTaskUIStore()
  const createTaskMutation = useCreateTask()
  const { data: repos, isLoading: reposLoading } = useRepos()
  const { data: agents } = useDetectedAgents()
  const { data: settings } = useSettings()

  const [repositoryId, setRepositoryId] = useState<string>('')
  const [userInput, setUserInput] = useState('')
  const lastAgentType = useTaskUIStore((state) => state.lastAgentType)
  const lastAgentModel = useTaskUIStore((state) => state.lastAgentModel)
  const setLastAgent = useTaskUIStore((state) => state.setLastAgent)
  const [agentType, setAgentType] = useState<string>(lastAgentType ?? '')
  const [agentModel, setAgentModel] = useState<string>(lastAgentModel ?? '')

  const selectedRepo = repos?.find((r) => r.id === repositoryId)

  // Agent override derived values
  const installedAgents = (agents ?? []).filter((a) => a.installed)
  const defaultAgentInfo = getAgentDisplayInfo(settings?.default_agent_type)
  const defaultAgentLabel = defaultAgentInfo
    ? `${defaultAgentInfo.name}${settings?.default_agent_model ? ' / ' + settings.default_agent_model : ''}`
    : null
  const selectedAgentData = installedAgents.find((a) => a.id === agentType)
  const selectedAgentModels = selectedAgentData?.models ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!repositoryId) {
      toast.error('Please select a repository')
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
        // Agent override (only if not "default")
        ...(agentType && agentType !== 'default' ? { agent_type: agentType as 'claude-code' | 'codex' | 'copilot' | 'gemini' } : {}),
        ...(agentModel ? { agent_model: agentModel } : {}),
      })

      // Persist agent preference for next time
      if (agentType && agentType !== 'default') {
        setLastAgent(agentType, agentModel || null)
      }

      toast.success('Task created', {
        description: 'You can generate the spec when ready.',
      })

      closeCreateModal()
      setRepositoryId('')
      setUserInput('')
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
      setRepositoryId('')
      setUserInput('')
    }
  }

  const isSubmitting = createTaskMutation.isPending

  return (
    <Dialog open={isCreateModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            New Task
          </DialogTitle>
          <DialogDescription>
            Describe what you need. The task will be created in &quot;To Do&quot; status and you can generate the spec when ready.
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

          {/* Agent Override (Advanced) */}
          {installedAgents.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
                >
                  <Terminal className="size-3.5" />
                  <span className="text-xs">Agent override</span>
                  <ChevronDown className="size-3" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="agent-override" className="text-sm">Agent</Label>
                  <Select
                    value={agentType}
                    onValueChange={(val) => {
                      setAgentType(val)
                      setAgentModel('')
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="agent-override" className="w-full">
                      <SelectValue placeholder={defaultAgentLabel ?? 'Use default agent'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        Use default{defaultAgentLabel ? ` (${defaultAgentLabel})` : ''}
                      </SelectItem>
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

                {selectedAgentModels.length > 1 && (
                  <div className="space-y-2">
                    <Label htmlFor="model-override" className="text-sm">Model</Label>
                    <Select
                      value={agentModel}
                      onValueChange={setAgentModel}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="model-override" className="w-full">
                        <SelectValue placeholder="Default model" />
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
              </CollapsibleContent>
            </Collapsible>
          )}

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
              disabled={!repositoryId || isSubmitting}
            >
              {isSubmitting ? (
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
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
