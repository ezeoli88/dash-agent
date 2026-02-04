'use client'

import { useState } from 'react'
import { Check, Eye, EyeOff, ExternalLink, Loader2, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useValidateOpenRouter } from '../hooks/use-validate-openrouter'
import { useSetupStore } from '../stores/setup-store'
import { AI_PROVIDER_INFO } from '../types'

interface OpenRouterCardProps {
  isSelected: boolean
  isConnected: boolean
  onSelect: () => void
  disabled?: boolean
}

/**
 * OpenRouter icon component
 */
function OpenRouterIcon({ className }: { className?: string }) {
  return (
    <Globe className={cn('size-8', className)} />
  )
}

/**
 * Card component for selecting OpenRouter as AI provider
 */
export function OpenRouterCard({
  isSelected,
  isConnected,
  onSelect,
  disabled = false,
}: OpenRouterCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [step, setStep] = useState<'api-key' | 'model-select'>('api-key')

  const providerInfo = AI_PROVIDER_INFO.openrouter
  const {
    validateKey,
    isValidating,
    connect,
    isConnecting,
    reset,
  } = useValidateOpenRouter()

  const validationState = useSetupStore((state) => state.validationState)
  const validationError = useSetupStore((state) => state.validationError)
  const availableModels = useSetupStore((state) => state.availableModels)

  const handleCardClick = () => {
    if (!disabled && !isConnected) {
      setDialogOpen(true)
      onSelect()
    }
  }

  const handleValidateKey = (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKey.trim()) return

    validateKey(
      { apiKey: apiKey.trim() },
      {
        onSuccess: (result) => {
          if (result.response.valid && result.response.freeModels && result.response.freeModels.length > 0) {
            setStep('model-select')
            // Pre-select first model
            setSelectedModel(result.response.freeModels[0].id)
          }
        },
      }
    )
  }

  const handleConnect = () => {
    if (!selectedModel) return

    connect(
      { apiKey: apiKey.trim(), model: selectedModel },
      {
        onSuccess: () => {
          handleClose()
        },
      }
    )
  }

  const handleClose = () => {
    setDialogOpen(false)
    setApiKey('')
    setShowKey(false)
    setSelectedModel('')
    setStep('api-key')
    reset()
  }

  const handleBack = () => {
    setStep('api-key')
    setSelectedModel('')
  }

  return (
    <>
      <Card
        className={cn(
          'relative cursor-pointer transition-all hover:shadow-md',
          isSelected && 'ring-2 ring-primary',
          isConnected && 'border-green-500 bg-green-50 dark:bg-green-950/20',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        onClick={handleCardClick}
      >
        {isConnected && (
          <div className="absolute -top-2 -right-2 rounded-full bg-green-500 p-1">
            <Check className="size-4 text-white" />
          </div>
        )}
        <CardContent className="flex flex-col items-center gap-4 pt-6">
          <div className="rounded-full bg-purple-100 p-4 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
            <OpenRouterIcon />
          </div>
          <div className="text-center">
            <h3 className="font-semibold">{providerInfo.name}</h3>
            <p className="text-sm text-muted-foreground">{providerInfo.description}</p>
          </div>
          <Button
            variant={isConnected ? 'secondary' : 'default'}
            size="sm"
            disabled={disabled || isConnected}
            onClick={(e) => {
              e.stopPropagation()
              if (!isConnected) {
                setDialogOpen(true)
                onSelect()
              }
            }}
          >
            {isConnected ? 'Conectado' : 'Conectar'}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar {providerInfo.name}</DialogTitle>
            <DialogDescription>
              {step === 'api-key'
                ? 'Ingresa tu API key de OpenRouter para acceder a modelos gratuitos.'
                : 'Selecciona el modelo gratuito que deseas usar.'}
            </DialogDescription>
          </DialogHeader>

          {step === 'api-key' ? (
            <form onSubmit={handleValidateKey} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="openrouter-api-key">API Key</Label>
                <div className="relative">
                  <Input
                    id="openrouter-api-key"
                    type={showKey ? 'text' : 'password'}
                    placeholder={providerInfo.apiKeyPlaceholder}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={isValidating}
                    className={
                      validationState === 'invalid'
                        ? 'border-destructive focus-visible:ring-destructive'
                        : ''
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowKey(!showKey)}
                    disabled={isValidating}
                  >
                    {showKey ? (
                      <EyeOff className="size-4 text-muted-foreground" />
                    ) : (
                      <Eye className="size-4 text-muted-foreground" />
                    )}
                    <span className="sr-only">
                      {showKey ? 'Ocultar' : 'Mostrar'} API key
                    </span>
                  </Button>
                </div>
                {validationState === 'invalid' && validationError && (
                  <p className="text-sm text-destructive">{validationError}</p>
                )}
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground">
                  No tienes una API key?{' '}
                  <a
                    href={providerInfo.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    Obten una aqui
                    <ExternalLink className="size-3" />
                  </a>
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isValidating}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={!apiKey.trim() || isValidating}
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Validando...
                    </>
                  ) : (
                    'Siguiente'
                  )}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="model-select">Modelo (solo gratuitos)</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger id="model-select">
                    <SelectValue placeholder="Selecciona un modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {availableModels.length} modelos gratuitos disponibles
                </p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground">
                  Los modelos gratuitos tienen limites de uso. Consulta{' '}
                  <a
                    href="https://openrouter.ai/openrouter/free"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    los detalles aqui
                    <ExternalLink className="size-3" />
                  </a>
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={isConnecting}
                >
                  Atras
                </Button>
                <Button
                  onClick={handleConnect}
                  disabled={!selectedModel || isConnecting}
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    'Conectar'
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
