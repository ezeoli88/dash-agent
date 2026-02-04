'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { AIProviderCard } from './ai-provider-card'
import { OpenRouterCard } from './openrouter-card'
import { ApiKeyDialog } from './api-key-dialog'
import { GitHubConnect } from './github-connect'
import { useSetupStatus, useCurrentSetupStep } from '../hooks/use-setup-status'
import { useSetupStore } from '../stores/setup-store'
import { useDeleteAISecret } from '../hooks/use-save-ai-secret'
import type { AIProvider } from '../types'
import { AI_PROVIDER_INFO } from '../types'

export function SetupScreen() {
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { hasAIProvider, hasGitHub, aiProvider } = useSetupStatus()
  const currentStep = useCurrentSetupStep()
  const clearAI = useSetupStore((state) => state.clearAI)
  const { mutate: deleteAISecret } = useDeleteAISecret()

  const handleProviderSelect = (provider: AIProvider) => {
    // OpenRouter has its own dialog, so don't open the generic one
    if (provider === 'openrouter') {
      setSelectedProvider(provider)
      return
    }
    setSelectedProvider(provider)
    setDialogOpen(true)
  }

  const handleDialogSuccess = () => {
    setSelectedProvider(null)
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

        {/* Progress indicator */}
        <div className="mb-8 flex items-center justify-center gap-4">
          <StepIndicator
            step={1}
            label="Proveedor IA"
            isComplete={hasAIProvider}
            isCurrent={currentStep === 'ai-provider'}
          />
          <div className="h-px w-8 bg-border" />
          <StepIndicator
            step={2}
            label="GitHub"
            isComplete={hasGitHub}
            isCurrent={currentStep === 'github'}
          />
        </div>

        {/* Step 1: AI Provider */}
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Paso 1: Conecta tu proveedor de IA
            </h2>
            {hasAIProvider && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  deleteAISecret(undefined, {
                    onSuccess: () => {
                      clearAI()
                    },
                  })
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="mr-1 size-4" />
                Cambiar
              </Button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <AIProviderCard
              provider={AI_PROVIDER_INFO.claude}
              isSelected={selectedProvider === 'claude'}
              isConnected={aiProvider === 'claude'}
              onSelect={handleProviderSelect}
              disabled={hasAIProvider && aiProvider !== 'claude'}
            />
            <AIProviderCard
              provider={AI_PROVIDER_INFO.openai}
              isSelected={selectedProvider === 'openai'}
              isConnected={aiProvider === 'openai'}
              onSelect={handleProviderSelect}
              disabled={hasAIProvider && aiProvider !== 'openai'}
            />
            <OpenRouterCard
              isSelected={selectedProvider === 'openrouter'}
              isConnected={aiProvider === 'openrouter'}
              onSelect={() => handleProviderSelect('openrouter')}
              disabled={hasAIProvider && aiProvider !== 'openrouter'}
            />
          </div>
        </div>

        <Separator className="mb-8" />

        {/* Step 2: GitHub */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">
            Paso 2: Conecta GitHub (para crear PRs)
          </h2>
          <GitHubConnect disabled={!hasAIProvider} />
          {!hasAIProvider && (
            <p className="mt-2 text-sm text-muted-foreground">
              Completa el paso 1 primero para habilitar la conexion con GitHub.
            </p>
          )}
        </div>

        {/* Help text */}
        <div className="rounded-lg border bg-muted/50 p-4">
          <h3 className="mb-2 font-medium">Por que necesitas conectar ambos?</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>
              <strong>Proveedor de IA:</strong> Para ejecutar el agente que analiza
              y modifica tu codigo.
            </li>
            <li>
              <strong>GitHub:</strong> Para crear Pull Requests automaticamente
              con los cambios del agente.
            </li>
          </ul>
        </div>
      </div>

      {/* API Key Dialog */}
      <ApiKeyDialog
        provider={selectedProvider}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleDialogSuccess}
      />
    </div>
  )
}

/**
 * Step indicator component for the progress bar
 */
interface StepIndicatorProps {
  step: number
  label: string
  isComplete: boolean
  isCurrent: boolean
}

function StepIndicator({ step, label, isComplete, isCurrent }: StepIndicatorProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          'flex size-8 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors',
          isComplete
            ? 'border-green-500 bg-green-500 text-white'
            : isCurrent
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/30 text-muted-foreground'
        )}
      >
        {isComplete ? <Check className="size-4" /> : step}
      </div>
      <span
        className={cn(
          'text-xs',
          isComplete || isCurrent ? 'font-medium' : 'text-muted-foreground'
        )}
      >
        {label}
      </span>
    </div>
  )
}
