'use client'

import { useState } from 'react'
import { Check, Github, Loader2, X, Key, ExternalLink, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useGitHubConnect } from '../hooks/use-github-oauth'
import { useValidateGitHubPAT } from '../hooks/use-validate-github-pat'
import { useSaveGitHubSecret, useDeleteGitHubSecret } from '../hooks/use-save-github-secret'
import { useSetupStore } from '../stores/setup-store'

interface GitHubConnectProps {
  disabled?: boolean
}

export function GitHubConnect({ disabled = false }: GitHubConnectProps) {
  const [showConnectDialog, setShowConnectDialog] = useState(false)

  const githubConnected = useSetupStore((state) => state.githubConnected)
  const githubUsername = useSetupStore((state) => state.githubUsername)
  const githubAvatarUrl = useSetupStore((state) => state.githubAvatarUrl)
  const githubConnectionMethod = useSetupStore((state) => state.githubConnectionMethod)
  const githubConnectionState = useSetupStore((state) => state.githubConnectionState)
  const githubError = useSetupStore((state) => state.githubError)
  const clearGitHub = useSetupStore((state) => state.clearGitHub)

  const { mutate: deleteGitHubSecret } = useDeleteGitHubSecret()

  const handleDisconnect = () => {
    deleteGitHubSecret(undefined, {
      onSuccess: () => {
        clearGitHub()
      },
    })
  }

  return (
    <>
      <Card
        className={cn(
          'transition-all',
          githubConnected && 'border-green-500 bg-green-50 dark:bg-green-950/20'
        )}
      >
        <CardContent className="flex items-center justify-between gap-4 pt-6">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'rounded-full p-3',
                githubConnected
                  ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <Github className="size-6" />
            </div>
            <div>
              <h3 className="font-semibold">GitHub</h3>
              {githubConnected && githubUsername ? (
                <div className="flex items-center gap-2">
                  <Avatar className="size-5">
                    <AvatarImage src={githubAvatarUrl || undefined} />
                    <AvatarFallback>
                      {githubUsername.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground">
                    @{githubUsername}
                  </span>
                  {githubConnectionMethod && (
                    <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                      {githubConnectionMethod === 'oauth' ? 'OAuth' : 'PAT'}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Conecta tu cuenta para crear PRs
                </p>
              )}
              {githubConnectionState === 'error' && githubError && (
                <p className="text-sm text-destructive">{githubError}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {githubConnected ? (
              <>
                <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Check className="size-4" />
                  <span className="text-sm font-medium">Conectado</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDisconnect}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                  <span className="sr-only">Desconectar GitHub</span>
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setShowConnectDialog(true)}
                disabled={disabled}
              >
                Conectar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <GitHubConnectDialog
        open={showConnectDialog}
        onOpenChange={setShowConnectDialog}
      />
    </>
  )
}

// =============================================================================
// GitHub Connect Dialog with OAuth + PAT options
// =============================================================================

interface GitHubConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function GitHubConnectDialog({ open, onOpenChange }: GitHubConnectDialogProps) {
  const [patToken, setPatToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [patValidated, setPatValidated] = useState<{
    username: string
    avatarUrl?: string
  } | null>(null)

  const { connect: connectOAuth, isConnecting: isOAuthConnecting } = useGitHubConnect()
  const { mutate: validatePAT, isPending: isValidatingPAT, reset: resetPATValidation } = useValidateGitHubPAT()
  const { mutate: saveGitHubSecret, isPending: isSavingPAT } = useSaveGitHubSecret()
  const setGitHubConnected = useSetupStore((state) => state.setGitHubConnected)
  const setGitHubConnectionState = useSetupStore((state) => state.setGitHubConnectionState)

  const [patError, setPatError] = useState<string | null>(null)

  const handleOAuthConnect = () => {
    connectOAuth()
    // Dialog will close when OAuth completes and redirects back
  }

  const handleValidatePAT = () => {
    if (!patToken.trim()) return

    setPatError(null)
    setPatValidated(null)

    validatePAT(
      { token: patToken.trim() },
      {
        onSuccess: (result) => {
          if (result.valid && result.username) {
            setPatValidated({
              username: result.username,
              avatarUrl: result.avatarUrl,
            })
          } else {
            setPatError(result.error || 'Token invalido')
          }
        },
        onError: (err) => {
          setPatError(err instanceof Error ? err.message : 'Error validando token')
        },
      }
    )
  }

  const handleSavePAT = () => {
    if (!patValidated) return

    saveGitHubSecret(
      {
        token: patToken.trim(),
        connectionMethod: 'pat',
        username: patValidated.username,
        avatarUrl: patValidated.avatarUrl,
      },
      {
        onSuccess: (result) => {
          if (result.success && result.username) {
            setGitHubConnected(result.username, result.avatarUrl ?? null, 'pat')
            handleClose()
          } else {
            setPatError(result.error || 'Error guardando token')
          }
        },
        onError: (err) => {
          setPatError(err instanceof Error ? err.message : 'Error guardando token')
        },
      }
    )
  }

  const handleClose = () => {
    setPatToken('')
    setShowToken(false)
    setPatValidated(null)
    setPatError(null)
    resetPATValidation()
    onOpenChange(false)
  }

  const isPATLoading = isValidatingPAT || isSavingPAT

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Conectar GitHub</DialogTitle>
          <DialogDescription>
            Elige como conectar tu cuenta de GitHub
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* OAuth Section */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <Github className="size-5 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium flex items-center gap-2">
                  OAuth
                  <span className="text-xs text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">
                    Recomendado
                  </span>
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Conecta con tu cuenta de GitHub de forma segura. Los permisos se pueden revocar en cualquier momento.
                </p>
              </div>
            </div>
            <Button
              onClick={handleOAuthConnect}
              disabled={isOAuthConnecting}
              className="w-full"
            >
              {isOAuthConnecting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Conectando...
                </>
              ) : (
                <>
                  <Github className="mr-2 size-4" />
                  Conectar con GitHub
                </>
              )}
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">o</span>
            </div>
          </div>

          {/* PAT Section */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-muted p-2">
                <Key className="size-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium">Personal Access Token</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Crea un token en{' '}
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=dash-agent"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    github.com/settings/tokens
                    <ExternalLink className="size-3" />
                  </a>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Permisos requeridos: <code className="bg-muted px-1 rounded">repo</code>,{' '}
                  <code className="bg-muted px-1 rounded">read:user</code>
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pat-token">Token</Label>
              <div className="relative">
                <Input
                  id="pat-token"
                  type={showToken ? 'text' : 'password'}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={patToken}
                  onChange={(e) => {
                    setPatToken(e.target.value)
                    setPatValidated(null)
                    setPatError(null)
                  }}
                  disabled={isPATLoading}
                  className={patError ? 'border-destructive' : ''}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowToken(!showToken)}
                  disabled={isPATLoading}
                >
                  {showToken ? (
                    <EyeOff className="size-4 text-muted-foreground" />
                  ) : (
                    <Eye className="size-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {patError && (
                <p className="text-sm text-destructive">{patError}</p>
              )}
            </div>

            {/* Validated user preview */}
            {patValidated && (
              <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <Avatar className="size-8">
                  <AvatarImage src={patValidated.avatarUrl} />
                  <AvatarFallback>
                    {patValidated.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    Token valido
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    @{patValidated.username}
                  </p>
                </div>
                <Check className="size-5 text-green-600 ml-auto" />
              </div>
            )}

            {patValidated ? (
              <Button
                onClick={handleSavePAT}
                disabled={isSavingPAT}
                className="w-full"
              >
                {isSavingPAT ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Conectar'
                )}
              </Button>
            ) : (
              <Button
                onClick={handleValidatePAT}
                disabled={!patToken.trim() || isValidatingPAT}
                variant="secondary"
                className="w-full"
              >
                {isValidatingPAT ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Validando...
                  </>
                ) : (
                  'Validar Token'
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
