'use client'

import { ArrowRight, Lightbulb } from 'lucide-react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { AgentSelector } from './agent-selector'
import { useSetupStatus } from '../hooks/use-setup-status'
import { useSetupStore } from '../stores/setup-store'

export function SetupScreen() {
  const { hasAIProvider } = useSetupStatus()
  const router = useRouter()
  const finishSetup = useSetupStore((state) => state.finishSetup)

  const handleContinue = () => {
    finishSetup()
    router.navigate({ to: '/repos' })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="mb-3 text-4xl font-bold tracking-tight">dash-agent</h1>
          <p className="text-lg text-muted-foreground">
            Gestiona tareas con agentes IA autonomos
          </p>
        </div>

        {/* Agent Selection */}
        <div className="mb-8">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">
              Selecciona tu agente de coding
            </h2>
          </div>
          <AgentSelector />
        </div>

        {/* GitHub recommendation callout */}
        <div className="mb-8 border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 rounded-r-lg p-4">
          <div className="flex gap-3">
            <Lightbulb className="size-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm mb-1">Recomendacion</p>
              <p className="text-sm text-muted-foreground">
                Conecta tu cuenta de GitHub o GitLab en Settings para poder crear Pull Requests o Merge Requests automaticamente cuando el agente termine sus cambios.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Podes hacerlo ahora o despues en Settings &gt; Conexiones.
              </p>
            </div>
          </div>
        </div>

        {/* Continue button */}
        <div className="mb-8">
          <Button
            disabled={!hasAIProvider}
            onClick={handleContinue}
          >
            Continuar
            <ArrowRight className="size-4 ml-2" />
          </Button>
        </div>

        {/* Help text */}
        <div className="rounded-lg border bg-muted/50 p-4">
          <h3 className="mb-2 font-medium">Que necesitas para empezar?</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>
              <strong>Agente de coding (requerido):</strong> Para ejecutar el agente que analiza
              y modifica tu codigo. Usa CLIs como Claude Code, Codex, Gemini o conecta OpenRouter.
            </li>
            <li>
              <strong>GitHub / GitLab (recomendado):</strong> Para crear PRs/MRs con los cambios del agente. Conectalo en Settings despues del setup.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
