'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Globe, Loader2, Eye, EyeOff, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useValidateOpenRouter } from '../../setup/hooks/use-validate-openrouter'
import { useSetupStore } from '../../setup/stores/setup-store'
import { apiClient } from '@/lib/api-client'

interface OpenRouterConnectProps {
  disabled?: boolean
}

export function OpenRouterConnect({ disabled = false }: OpenRouterConnectProps) {
  const [showConnectDialog, setShowConnectDialog] = useState(false)

  const queryClient = useQueryClient()
  const aiProvider = useSetupStore((state) => state.aiProvider)
  const aiConnected = useSetupStore((state) => state.aiConnected)
  const aiModel = useSetupStore((state) => state.aiModel)
  const aiModelInfo = useSetupStore((state) => state.aiModelInfo)
  const clearAI = useSetupStore((state) => state.clearAI)

  const isConnected = aiProvider === 'openrouter' && aiConnected

  const handleDisconnect = async () => {
    try {
      await apiClient.delete('/secrets/ai')
      clearAI()
      // Invalidate detected-agents so model selectors reflect the disconnection
      queryClient.invalidateQueries({ queryKey: ['detected-agents'] })
    } catch {
      // Silently fail - the UI will remain in connected state
    }
  }

  return (
    <>
      <Card
        className={cn(
          'transition-all',
          isConnected && 'border-green-500 bg-green-50 dark:bg-green-950/20'
        )}
      >
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div
                className={cn(
                  'rounded-full p-3 shrink-0',
                  isConnected
                    ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <Globe className="size-6" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold">OpenRouter</h3>
                {isConnected ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-muted-foreground truncate">
                      {aiModelInfo?.name ?? aiModel ?? 'Modelo conectado'}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Conecta OpenRouter para usar modelos via API
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  onClick={() => setShowConnectDialog(true)}
                  disabled={disabled}
                >
                  Conectar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <OpenRouterConnectDialog
        open={showConnectDialog}
        onOpenChange={setShowConnectDialog}
      />
    </>
  )
}

// =============================================================================
// OpenRouter Connect Dialog
// =============================================================================

interface OpenRouterConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function OpenRouterConnectDialog({ open, onOpenChange }: OpenRouterConnectDialogProps) {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [selectedModel, setSelectedModel] = useState('')
  const [error, setError] = useState<string | null>(null)

  const availableModels = useSetupStore((state) => state.availableModels)
  const validationState = useSetupStore((state) => state.validationState)

  const {
    validateKey,
    isValidating,
    connect,
    isConnecting,
    reset,
  } = useValidateOpenRouter()

  const isKeyValidated = validationState === 'valid' && availableModels.length > 0

  const handleValidateKey = () => {
    if (!apiKey.trim()) return

    setError(null)
    validateKey(
      { apiKey: apiKey.trim() },
      {
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Error validando API key')
        },
      }
    )
  }

  const handleConnect = () => {
    if (!selectedModel || !apiKey.trim()) return

    setError(null)
    connect(
      { apiKey: apiKey.trim(), model: selectedModel },
      {
        onSuccess: () => {
          handleClose()
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Error conectando')
        },
      }
    )
  }

  const handleClose = () => {
    setApiKey('')
    setShowKey(false)
    setSelectedModel('')
    setError(null)
    reset()
    onOpenChange(false)
  }

  const isLoading = isValidating || isConnecting

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Conectar OpenRouter</DialogTitle>
          <DialogDescription>
            Ingresa tu API key de OpenRouter para usar modelos via API
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* API Key input */}
          <div className="space-y-2">
            <Label htmlFor="openrouter-api-key">API Key</Label>
            <div className="relative">
              <Input
                id="openrouter-api-key"
                type={showKey ? 'text' : 'password'}
                placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxx"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setError(null)
                  if (isKeyValidated) {
                    reset()
                    setSelectedModel('')
                  }
                }}
                disabled={isLoading}
                className={error ? 'border-destructive' : ''}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowKey(!showKey)}
                disabled={isLoading}
              >
                {showKey ? (
                  <EyeOff className="size-4 text-muted-foreground" />
                ) : (
                  <Eye className="size-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Obtene tu API key en{' '}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                openrouter.ai/keys
                <ExternalLink className="size-3" />
              </a>
            </p>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          {/* Model selector (shown after validation) */}
          {isKeyValidated && (
            <div className="space-y-2">
              <Label htmlFor="openrouter-model">Modelo</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger id="openrouter-model" className="w-full">
                  <SelectValue placeholder="Selecciona un modelo" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <span>{model.name}</span>
                      {model.pricing?.prompt === '0' && model.pricing?.completion === '0' && (
                        <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                          Free
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Action buttons */}
          {isKeyValidated ? (
            <Button
              onClick={handleConnect}
              disabled={!selectedModel || isConnecting}
              className="w-full"
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
          ) : (
            <Button
              onClick={handleValidateKey}
              disabled={!apiKey.trim() || isValidating}
              variant="secondary"
              className="w-full"
            >
              {isValidating ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Validando...
                </>
              ) : (
                'Validar'
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
