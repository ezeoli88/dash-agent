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
import type { ReactNode } from 'react'

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
  { name: string; icon: ReactNode; colorClasses: { bg: string; text: string } }
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
  gemini: {
    name: 'Gemini',
    icon: '\u2728',
    colorClasses: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-600 dark:text-purple-400',
    },
  },
  copilot: {
    name: 'GitHub Copilot',
    icon: (
      <img
        src="data:image/png;base64,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"
        alt="GitHub Copilot"
        className="size-4"
      />
    ),
    colorClasses: {
      bg: 'bg-gray-100 dark:bg-gray-900/30',
      text: 'text-gray-600 dark:text-gray-400',
    },
  },
  openrouter: {
    name: 'OpenRouter',
    icon: '\u{1F310}',
    colorClasses: {
      bg: 'bg-indigo-100 dark:bg-indigo-900/30',
      text: 'text-indigo-600 dark:text-indigo-400',
    },
  },
  minimax: {
    name: 'MiniMax',
    icon: '\u{1F916}',
    colorClasses: {
      bg: 'bg-rose-100 dark:bg-rose-900/30',
      text: 'text-rose-600 dark:text-rose-400',
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

  // Only show agents that are installed on the user's machine
  const agentList: DetectedAgent[] = (agents ?? []).filter((a) => a.installed)

  // No installed agents
  if (agentList.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-4 text-sm text-muted-foreground">
        <AlertCircle className="size-4 shrink-0 text-yellow-500" />
        <span>No se detectaron agentes instalados. Instala Claude Code, Codex, Gemini CLI, GitHub Copilot o conecta OpenRouter para continuar.</span>
      </div>
    )
  }

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
