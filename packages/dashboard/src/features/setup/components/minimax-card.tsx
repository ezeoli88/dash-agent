'use client'

import { useState } from 'react'
import { Check, Eye, EyeOff, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react'
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
import { useValidateMiniMax } from '../hooks/use-validate-minimax'
import { useSetupStore } from '../stores/setup-store'
import { AI_PROVIDER_INFO } from '../types'

interface MiniMaxCardProps {
  isSelected: boolean
  isConnected: boolean
  onSelect: () => void
  disabled?: boolean
}

/**
 * MiniMax icon component
 */
function MiniMaxIcon({ className }: { className?: string }) {
  return (
    <img src="/minimax-icon.ico" alt="MiniMax" className={cn('size-8', className)} />
  )
}

/**
 * Card component for selecting MiniMax as AI provider
 */
export function MiniMaxCard({
  isSelected,
  isConnected,
  onSelect,
  disabled = false,
}: MiniMaxCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  const providerInfo = AI_PROVIDER_INFO.minimax
  const {
    validateKey,
    isValidating,
    connect,
    isConnecting,
    reset,
  } = useValidateMiniMax()

  const validationState = useSetupStore((state) => state.validationState)
  const validationError = useSetupStore((state) => state.validationError)

  const handleCardClick = () => {
    if (!disabled && !isConnected) {
      setDialogOpen(true)
      onSelect()
    }
  }

  const handleValidateAndConnect = (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKey.trim()) return

    validateKey(
      { apiKey: apiKey.trim() },
      {
        onSuccess: (result) => {
          if (result.response.valid) {
            // Key is valid, proceed to save
            connect(
              { apiKey: apiKey.trim() },
              {
                onSuccess: () => {
                  handleClose()
                },
              }
            )
          }
        },
      }
    )
  }

  const handleClose = () => {
    setDialogOpen(false)
    setApiKey('')
    setShowKey(false)
    reset()
  }

  const isLoading = isValidating || isConnecting

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
          <div className="rounded-full bg-rose-100 p-4 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
            <MiniMaxIcon />
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
              Ingresa tu API key de MiniMax para acceder a los modelos.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleValidateAndConnect} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="minimax-setup-api-key">API Key</Label>
              <div className="relative">
                <Input
                  id="minimax-setup-api-key"
                  type={showKey ? 'text' : 'password'}
                  placeholder={providerInfo.apiKeyPlaceholder}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={isLoading}
                  className={cn(
                    'pr-10',
                    validationState === 'invalid'
                      ? 'border-destructive focus-visible:ring-destructive'
                      : validationState === 'valid'
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
                  <span className="sr-only">
                    {showKey ? 'Ocultar' : 'Mostrar'} API key
                  </span>
                </Button>
              </div>
              {validationState === 'invalid' && validationError && (
                <p className="text-sm text-destructive">{validationError}</p>
              )}
              {validationState === 'valid' && (
                <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="size-4" />
                  API key válida
                </p>
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
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!apiKey.trim() || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {isValidating ? 'Validando...' : 'Conectando...'}
                  </>
                ) : (
                  'Conectar'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
