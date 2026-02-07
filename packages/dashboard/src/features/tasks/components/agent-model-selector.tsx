'use client'

import { Terminal, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useDetectedAgents } from '@/features/setup/hooks/use-detected-agents'
import { useSettings } from '@/features/setup/hooks/use-settings'
import { getAgentDisplayInfo, getAgentLabel } from '../utils/agent-display'
import { isTerminalStatus, isActiveStatus } from '../types'
import { useUpdateTask } from '../hooks/use-update-task'
import { useTaskUIStore } from '../stores/task-ui-store'
import type { Task } from '../types'
import type { AgentType } from '@dash-agent/shared'

interface AgentModelSelectorProps {
  task: Task
  variant?: 'full' | 'compact'
}

export function AgentModelSelector({ task, variant = 'full' }: AgentModelSelectorProps) {
  const { data: agents, isLoading: agentsLoading } = useDetectedAgents()
  const { data: settings } = useSettings()
  const updateTaskMutation = useUpdateTask(task.id)
  const setLastAgent = useTaskUIStore((state) => state.setLastAgent)

  // Determine if the selector should be editable
  const isEditable = !isTerminalStatus(task.status) && !isActiveStatus(task.status)

  // Filter to only installed agents
  const installedAgents = (agents ?? []).filter((a) => a.installed)

  // Current values from the task (null means "use default")
  const currentAgentType = task.agent_type ?? ''
  const currentAgentModel = task.agent_model ?? ''

  // Get display info for the current agent
  const agentInfo = getAgentDisplayInfo(task.agent_type)
  const agentLabel = getAgentLabel(task.agent_type, task.agent_model)

  // Default agent info from settings
  const defaultAgentInfo = getAgentDisplayInfo(settings?.default_agent_type)
  const defaultAgentLabel = defaultAgentInfo
    ? `${defaultAgentInfo.name}${settings?.default_agent_model ? ' / ' + settings.default_agent_model : ''}`
    : 'System default'

  // Models for the currently selected agent type
  const selectedAgentData = installedAgents.find((a) => a.id === currentAgentType)
  const availableModels = selectedAgentData?.models ?? []

  // Handle agent type change
  async function handleAgentTypeChange(value: string) {
    const isDefault = value === 'default'
    const newAgentType = isDefault ? null : (value as AgentType)

    // Find the first model for the new agent
    const newAgentData = installedAgents.find((a) => a.id === value)
    const newModel = newAgentData?.models?.[0]?.id ?? null

    try {
      await updateTaskMutation.mutateAsync({
        agent_type: newAgentType,
        agent_model: isDefault ? null : newModel,
      })
      // Persist the selection
      if (!isDefault) {
        setLastAgent(value, newModel)
      }
      toast.success('Agent updated')
    } catch (error) {
      console.error('Failed to update agent:', error)
      toast.error('Failed to update agent', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  // Handle model change
  async function handleModelChange(value: string) {
    try {
      await updateTaskMutation.mutateAsync({
        agent_model: value,
      })
      // Persist the selection
      setLastAgent(currentAgentType, value)
      toast.success('Model updated')
    } catch (error) {
      console.error('Failed to update model:', error)
      toast.error('Failed to update model', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  const isCompact = variant === 'compact'

  // --- Read-only display when not editable ---
  if (!isEditable) {
    if (isCompact) {
      return (
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          {agentInfo ? (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                agentInfo.colorClasses.bg,
                agentInfo.colorClasses.text
              )}
            >
              {agentInfo.icon} {agentLabel}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Default ({defaultAgentLabel})
            </span>
          )}
        </div>
      )
    }

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Terminal className="h-5 w-5" />
            Agent / Model
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {agentInfo ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium',
                  agentInfo.colorClasses.bg,
                  agentInfo.colorClasses.text
                )}
              >
                {agentInfo.icon} {agentLabel}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Default ({defaultAgentLabel})
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Agent cannot be changed while the task is active or completed.
          </p>
        </CardContent>
      </Card>
    )
  }

  // --- Loading state ---
  if (agentsLoading) {
    if (isCompact) {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading agents...
        </div>
      )
    }

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Terminal className="h-5 w-5" />
            Agent / Model
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading agents...
          </div>
        </CardContent>
      </Card>
    )
  }

  // --- Compact editable variant ---
  if (isCompact) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Agent</span>
          {updateTaskMutation.isPending && (
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          )}
        </div>
        <Select
          value={currentAgentType || 'default'}
          onValueChange={handleAgentTypeChange}
          disabled={updateTaskMutation.isPending}
        >
          <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
            <SelectValue placeholder="Select agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">
              Default{defaultAgentLabel ? ` (${defaultAgentLabel})` : ''}
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

        {currentAgentType && availableModels.length > 0 && (
          <Select
            value={currentAgentModel || availableModels[0]?.id || ''}
            onValueChange={handleModelChange}
            disabled={updateTaskMutation.isPending}
          >
            <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    )
  }

  // --- Full editable variant (default) ---
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Terminal className="h-5 w-5" />
          Agent / Model
          {updateTaskMutation.isPending && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Agent Type Selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Agent
            </label>
            <Select
              value={currentAgentType || 'default'}
              onValueChange={handleAgentTypeChange}
              disabled={updateTaskMutation.isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  Default{defaultAgentLabel ? ` (${defaultAgentLabel})` : ''}
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

          {/* Model Selector -- only shown when a specific agent is selected and has multiple models */}
          {currentAgentType && availableModels.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Model
              </label>
              <Select
                value={currentAgentModel || availableModels[0]?.id || ''}
                onValueChange={handleModelChange}
                disabled={updateTaskMutation.isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                      {model.description && (
                        <span className="ml-1 text-muted-foreground">
                          - {model.description}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
