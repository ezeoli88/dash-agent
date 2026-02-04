'use client'

import { useState } from 'react'
import { Eye, EyeOff, ExternalLink, Loader2, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSaveAISecret } from '../hooks/use-save-ai-secret'
import { useSetupStore } from '../stores/setup-store'
import type { AIProvider } from '../types'
import { AI_PROVIDER_INFO } from '../types'

interface ApiKeyDialogProps {
  provider: AIProvider | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function ApiKeyDialog({
  provider,
  open,
  onOpenChange,
  onSuccess,
}: ApiKeyDialogProps) {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  const { mutate: saveSecret, isPending, error, reset } = useSaveAISecret()
  const setAIConnected = useSetupStore((state) => state.setAIConnected)
  const setValidationState = useSetupStore((state) => state.setValidationState)

  // OpenRouter uses its own card/dialog, skip here
  const providerInfo = provider && provider !== 'openrouter' ? AI_PROVIDER_INFO[provider] : null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!provider || !apiKey.trim()) return

    setValidationState('validating')

    saveSecret(
      { provider, apiKey: apiKey.trim() },
      {
        onSuccess: (result) => {
          if (result.success) {
            // Update local store with connection status
            setAIConnected(provider, result.modelInfo)
            setApiKey('')
            onOpenChange(false)
            onSuccess?.()
          } else {
            setValidationState('invalid', result.error || 'Failed to save API key')
          }
        },
        onError: (err) => {
          setValidationState('invalid', err instanceof Error ? err.message : 'Failed to save API key')
        },
      }
    )
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setApiKey('')
      setShowKey(false)
      reset()
      setValidationState('idle')
    }
    onOpenChange(newOpen)
  }

  if (!providerInfo) return null

  const errorMessage = error instanceof Error ? error.message : error ? String(error) : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar {providerInfo.name}</DialogTitle>
          <DialogDescription>
            Ingresa tu API key de {providerInfo.name}. Tu key sera almacenada de forma segura en el servidor con encriptacion AES-256.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                placeholder={providerInfo.apiKeyPlaceholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isPending}
                className={
                  errorMessage
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
                disabled={isPending}
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
            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}
          </div>
          <div className="rounded-md bg-muted p-3 space-y-2">
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
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Check className="size-3 text-green-500" />
              Tu key se guarda encriptada en el servidor, nunca en tu navegador
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!apiKey.trim() || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Validando...
                </>
              ) : (
                'Conectar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
