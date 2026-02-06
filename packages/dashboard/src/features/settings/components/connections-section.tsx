'use client'

import { useState } from 'react'
import { Check, X, Bot, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSetupStore } from '@/features/setup/stores/setup-store'
import { ApiKeyDialog } from '@/features/setup/components/api-key-dialog'
import { GitHubConnect } from '@/features/setup/components/github-connect'
import { AgentSelector } from '@/features/setup/components/agent-selector'
import { useDeleteAISecret } from '@/features/setup/hooks/use-save-ai-secret'
import { AI_PROVIDER_INFO, type AIProvider } from '@/features/setup/types'

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex',
  'copilot': 'Copilot',
  'gemini': 'Gemini',
}

/**
 * Claude icon component
 */
function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn('size-5', className)}
    >
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8zm-1-13h2v6h-2V7zm0 8h2v2h-2v-2z" />
    </svg>
  )
}

/**
 * OpenAI icon component
 */
function OpenAIIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn('size-5', className)}
    >
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4069-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  )
}

/**
 * Connections section showing CLI Agent, AI and GitHub connection status
 */
export function ConnectionsSection() {
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null)
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false)
  const [showAgentSelector, setShowAgentSelector] = useState(false)

  const { mutate: deleteAISecret } = useDeleteAISecret()

  const aiProvider = useSetupStore((state) => state.aiProvider)
  const aiConnected = useSetupStore((state) => state.aiConnected)
  const clearAI = useSetupStore((state) => state.clearAI)

  const selectedAgent = useSetupStore((state) => state.selectedAgent)
  const selectedAgentModel = useSetupStore((state) => state.selectedAgentModel)
  const agentConnected = useSetupStore((state) => state.agentConnected)
  const clearAgent = useSetupStore((state) => state.clearAgent)

  const isAIConnected = aiConnected && aiProvider !== null

  const handleChangeAI = () => {
    setSelectedProvider(aiProvider || 'claude')
    setIsApiKeyDialogOpen(true)
  }

  const handleConnectAI = (provider: AIProvider) => {
    setSelectedProvider(provider)
    setIsApiKeyDialogOpen(true)
  }

  const handleDisconnectAI = () => {
    deleteAISecret(undefined, {
      onSuccess: () => {
        clearAI()
      },
    })
  }

  const providerInfo = aiProvider ? AI_PROVIDER_INFO[aiProvider] : null

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conexiones</CardTitle>
          <CardDescription>
            Gestiona tus conexiones con proveedores de AI y GitHub
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* CLI Agent Connection */}
          <div
            className={cn(
              'flex items-center justify-between rounded-lg border p-4 transition-colors',
              agentConnected && 'border-green-500/50 bg-green-50 dark:bg-green-950/20'
            )}
          >
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'rounded-full p-2.5',
                  agentConnected
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <Terminal className="size-5" />
              </div>
              <div>
                <h4 className="font-medium">
                  {agentConnected && selectedAgent ? AGENT_DISPLAY_NAMES[selectedAgent] || selectedAgent : 'Agente CLI'}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {agentConnected ? `Modelo: ${selectedAgentModel || 'default'}` : 'Selecciona un agente de coding CLI'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {agentConnected ? (
                <>
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <Check className="size-4" />
                    <span className="text-sm font-medium">Conectado</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowAgentSelector(true)}>
                    Cambiar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearAgent}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setShowAgentSelector(true)}>
                  Seleccionar
                </Button>
              )}
            </div>
          </div>

          {/* Agent Selector (collapsible) */}
          {showAgentSelector && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <AgentSelector onAgentSelected={() => setShowAgentSelector(false)} compact />
            </div>
          )}

          {/* AI Connection */}
          <div
            className={cn(
              'flex items-center justify-between rounded-lg border p-4 transition-colors',
              isAIConnected && 'border-green-500/50 bg-green-50 dark:bg-green-950/20'
            )}
          >
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'rounded-full p-2.5',
                  isAIConnected
                    ? aiProvider === 'claude'
                      ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
                      : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {aiProvider === 'claude' ? (
                  <ClaudeIcon />
                ) : aiProvider === 'openai' ? (
                  <OpenAIIcon />
                ) : (
                  <Bot className="size-5" />
                )}
              </div>
              <div>
                <h4 className="font-medium">
                  {isAIConnected && providerInfo ? providerInfo.name : 'AI Provider'}
                </h4>
                {isAIConnected && providerInfo ? (
                  <p className="text-sm text-muted-foreground">
                    {providerInfo.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Conecta Claude o OpenAI
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAIConnected ? (
                <>
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <Check className="size-4" />
                    <span className="text-sm font-medium">Conectado</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleChangeAI}>
                    Cambiar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDisconnectAI}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-4" />
                    <span className="sr-only">Desconectar AI</span>
                  </Button>
                </>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleConnectAI('claude')}
                  >
                    Claude
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleConnectAI('openai')}
                  >
                    OpenAI
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* GitHub Connection - now using the component with PAT support */}
          <GitHubConnect />
        </CardContent>
      </Card>

      {/* API Key Dialog */}
      <ApiKeyDialog
        provider={selectedProvider}
        open={isApiKeyDialogOpen}
        onOpenChange={setIsApiKeyDialogOpen}
      />
    </>
  )
}
