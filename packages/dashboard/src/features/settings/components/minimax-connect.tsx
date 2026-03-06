'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Eye, EyeOff, ExternalLink, CheckCircle2 } from 'lucide-react'
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
import { useValidateMiniMax } from '../../setup/hooks/use-validate-minimax'
import { useSetupStore } from '../../setup/stores/setup-store'
import { apiClient } from '@/lib/api-client'

interface MiniMaxConnectProps {
  disabled?: boolean
}

export function MiniMaxConnect({ disabled = false }: MiniMaxConnectProps) {
  const [showConnectDialog, setShowConnectDialog] = useState(false)

  const queryClient = useQueryClient()
  const aiProvider = useSetupStore((state) => state.aiProvider)
  const aiConnected = useSetupStore((state) => state.aiConnected)
  const clearAI = useSetupStore((state) => state.clearAI)

  const isConnected = aiProvider === 'minimax' && aiConnected

  const handleDisconnect = async () => {
    try {
      await apiClient.delete('/secrets/ai')
      clearAI()
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
                    ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <img src="/minimax-icon.ico" alt="MiniMax" className="size-6" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold">MiniMax</h3>
                {isConnected ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-muted-foreground truncate">
                      Conectado
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Conecta MiniMax para usar modelos via API
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

      <MiniMaxConnectDialog
        open={showConnectDialog}
        onOpenChange={setShowConnectDialog}
      />
    </>
  )
}

// =============================================================================
// MiniMax Connect Dialog
// =============================================================================

interface MiniMaxConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function MiniMaxConnectDialog({ open, onOpenChange }: MiniMaxConnectDialogProps) {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validationState = useSetupStore((state) => state.validationState)
  const validationError = useSetupStore((state) => state.validationError)

  const {
    validateKey,
    isValidating,
    connect,
    isConnecting,
    reset,
  } = useValidateMiniMax()

  const isKeyValidated = validationState === 'valid'

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
    if (!apiKey.trim()) return

    setError(null)
    connect(
      { apiKey: apiKey.trim() },
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
    setError(null)
    reset()
    onOpenChange(false)
  }

  const isLoading = isValidating || isConnecting

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Conectar MiniMax</DialogTitle>
          <DialogDescription>
            Ingresa tu API key de MiniMax para usar modelos via API
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* API Key input */}
          <div className="space-y-2">
            <Label htmlFor="minimax-api-key">API Key</Label>
            <div className="relative">
              <Input
                id="minimax-api-key"
                type={showKey ? 'text' : 'password'}
                placeholder="eyJhbGciOi..."
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setError(null)
                  if (isKeyValidated) {
                    reset()
                  }
                }}
                disabled={isLoading}
                className={cn(
                  'pr-10',
                  error || (validationState === 'invalid' && validationError)
                    ? 'border-destructive'
                    : isKeyValidated
                      ? 'border-green-500'
                      : ''
                )}
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
                href="https://www.minimaxi.com/platform"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                minimaxi.com/platform
                <ExternalLink className="size-3" />
              </a>
            </p>
            {(error || (validationState === 'invalid' && validationError)) && (
              <p className="text-sm text-destructive">
                {error || validationError}
              </p>
            )}
            {isKeyValidated && (
              <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle2 className="size-4" />
                API key válida
              </p>
            )}
          </div>

          {/* Action buttons */}
          {isKeyValidated ? (
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
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
