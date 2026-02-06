import type { AgentType } from '@dash-agent/shared'

export interface AgentDisplayInfo {
  name: string
  icon: string
  colorClasses: { bg: string; text: string }
}

export const AGENT_DISPLAY_INFO: Record<AgentType, AgentDisplayInfo> = {
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

export function getAgentDisplayInfo(agentType: string | null | undefined): AgentDisplayInfo | null {
  if (!agentType) return null
  return AGENT_DISPLAY_INFO[agentType as AgentType] ?? null
}

export function getAgentLabel(agentType: string | null | undefined, agentModel: string | null | undefined): string | null {
  const info = getAgentDisplayInfo(agentType)
  if (!info) return null
  if (agentModel) return `${info.name} / ${agentModel}`
  return info.name
}
