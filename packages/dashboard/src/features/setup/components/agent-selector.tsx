'use client'

import { Check, Terminal, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useDetectedAgents } from '../hooks/use-detected-agents'
import { useSettings, useUpdateSettings } from '../hooks/use-settings'
import { useSetupStore } from '../stores/setup-store'
import type { DetectedAgent, AgentModel } from '@dash-agent/shared'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AgentSelectorProps {
  onAgentSelected?: (agentType: string, model?: string) => void
  compact?: boolean
}

// ---------------------------------------------------------------------------
// Agent display metadata
// ---------------------------------------------------------------------------

const AGENT_INFO: Record<
  string,
  { name: string; icon: string; colorClasses: { bg: string; text: string } }
> = {
  'claude-code': {
    name: 'Claude Code',
    icon: '\u{1F916}',
    colorClasses: {
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      text: 'text-orange-600 dark:text-orange-400',
    },
  },
  codex: {
    name: 'Codex',
    icon: '\u{1F52E}',
    colorClasses: {
      bg: 'bg-emerald-100 dark:bg-emerald-900/30',
      text: 'text-emerald-600 dark:text-emerald-400',
    },
  },
  copilot: {
    name: 'Copilot',
    icon: '\u{1F680}',
    colorClasses: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-600 dark:text-blue-400',
    },
  },
  gemini: {
    name: 'Gemini',
    icon: '\u2728',
    colorClasses: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-600 dark:text-purple-400',
    },
  },
}

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

function AgentStatusBadge({ agent }: { agent: DetectedAgent }) {
  if (!agent.installed) {
    return (
      <Badge variant="secondary" className="text-xs">
        No instalado
      </Badge>
    )
  }
  if (!agent.authenticated) {
    return (
      <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:text-yellow-400 text-xs">
        Sin auth
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400 text-xs">
      Detectado
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function AgentSelectorSkeleton({ compact }: { compact?: boolean }) {
  const cardHeight = compact ? 'h-24' : 'h-36'
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className={cn('rounded-lg', cardHeight)} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentSelector({ onAgentSelected, compact = false }: AgentSelectorProps) {
  const { data: agents, isLoading, isError, error } = useDetectedAgents()
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  const selectedAgent = useSetupStore((s) => s.selectedAgent)
  const selectedAgentModel = useSetupStore((s) => s.selectedAgentModel)
  const setSelectedAgent = useSetupStore((s) => s.setSelectedAgent)

  // ---- Loading state ----
  if (isLoading) {
    return <AgentSelectorSkeleton compact={compact} />
  }

  // ---- Error state ----
  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertCircle className="size-4 shrink-0" />
        <span>Error al detectar agentes: {(error as Error)?.message ?? 'Error desconocido'}</span>
      </div>
    )
  }

  // Build a lookup with server data merged with display metadata
  const agentList: DetectedAgent[] = agents ?? []

  // Determine which agent is currently selected (from store or server settings)
  const activeAgentId = selectedAgent ?? settings?.default_agent_type ?? null
  const activeModel = selectedAgentModel ?? settings?.default_agent_model ?? null

  // The currently-selected agent's models list
  const activeAgentData = agentList.find((a) => a.id === activeAgentId)
  const showModelSelect = activeAgentData && activeAgentData.models.length > 1

  // ---- Handlers ----
  function handleSelectAgent(agent: DetectedAgent) {
    if (!agent.installed) return

    const defaultModel = agent.models.length > 0 ? agent.models[0].id : undefined
    setSelectedAgent(agent.id, defaultModel)

    updateSettings.mutate({
      default_agent_type: agent.id,
      default_agent_model: defaultModel ?? null,
    })

    onAgentSelected?.(agent.id, defaultModel)
  }

  function handleSelectModel(modelId: string) {
    if (!activeAgentId) return

    setSelectedAgent(activeAgentId, modelId)

    updateSettings.mutate({
      default_agent_type: activeAgentId,
      default_agent_model: modelId,
    })

    onAgentSelected?.(activeAgentId, modelId)
  }

  // ---- Render ----
  return (
    <div className="space-y-4">
      {/* Agent cards grid */}
      <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4')}>
        {agentList.map((agent) => {
          const info = AGENT_INFO[agent.id]
          const isActive = activeAgentId === agent.id
          const isDisabled = !agent.installed

          return (
            <Card
              key={agent.id}
              className={cn(
                'relative cursor-pointer transition-all hover:shadow-md',
                isActive && 'ring-2 ring-primary',
                isActive && agent.authenticated && 'border-green-500 bg-green-50 dark:bg-green-950/20',
                isDisabled && 'cursor-not-allowed opacity-50',
                compact && 'py-2'
              )}
              onClick={() => handleSelectAgent(agent)}
            >
              {/* Selected checkmark */}
              {isActive && (
                <div className="absolute top-2 right-2 rounded-full bg-primary p-1">
                  <Check className="size-3.5 text-primary-foreground" />
                </div>
              )}

              <CardContent className={cn(
                'flex flex-col items-center gap-2',
                compact ? 'px-3 py-2' : 'gap-3 pt-5'
              )}>
                {/* Icon */}
                <div
                  className={cn(
                    'flex items-center justify-center rounded-full',
                    compact ? 'size-9' : 'size-12',
                    info?.colorClasses.bg ?? 'bg-muted'
                  )}
                >
                  {info ? (
                    <span className={compact ? 'text-base' : 'text-xl'}>{info.icon}</span>
                  ) : (
                    <Terminal className={cn('shrink-0 text-muted-foreground', compact ? 'size-4' : 'size-5')} />
                  )}
                </div>

                {/* Name + version */}
                <div className="text-center">
                  <h3 className={cn('font-semibold leading-tight', compact ? 'text-xs' : 'text-sm')}>
                    {info?.name ?? agent.name}
                  </h3>
                  {agent.version && !compact && (
                    <p className="text-xs text-muted-foreground">v{agent.version}</p>
                  )}
                </div>

                {/* Status badge */}
                <AgentStatusBadge agent={agent} />
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Model selector dropdown — always rendered to avoid layout shift */}
      <div className={cn('space-y-1.5 transition-opacity', showModelSelect ? 'opacity-100' : 'pointer-events-none opacity-0 h-0 overflow-hidden')}>
        {activeAgentData && activeAgentData.models.length > 1 && (
          <>
            <label className="text-sm font-medium text-muted-foreground">
              Selecciona un modelo
            </label>
            <Select value={activeModel ?? undefined} onValueChange={handleSelectModel}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder="Selecciona un modelo" />
              </SelectTrigger>
              <SelectContent>
                {activeAgentData.models.map((model: AgentModel) => (
                  <SelectItem key={model.id} value={model.id}>
                    <span>{model.name}</span>
                    {model.description && (
                      <span className="ml-2 text-muted-foreground">- {model.description}</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {/* Saving indicator — uses opacity to avoid layout shift */}
      <div className={cn('flex items-center gap-2 text-xs text-muted-foreground transition-opacity', updateSettings.isPending ? 'opacity-100' : 'opacity-0')}>
        <Loader2 className="size-3 animate-spin" />
        <span>Guardando...</span>
      </div>
    </div>
  )
}
