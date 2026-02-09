'use client'

import { useState } from 'react'
import { Check, Loader2, Key, ExternalLink, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useValidateGitLabPAT } from '../hooks/use-validate-gitlab-pat'
import { useSaveGitLabSecret, useDeleteGitLabSecret } from '../hooks/use-save-gitlab-secret'
import { useSetupStore } from '../stores/setup-store'

/**
 * GitLab icon component
 */
function GitLabIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn('size-6', className)}
    >
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
    </svg>
  )
}

interface GitLabConnectProps {
  disabled?: boolean
}

export function GitLabConnect({ disabled = false }: GitLabConnectProps) {
  const [showConnectDialog, setShowConnectDialog] = useState(false)

  const gitlabConnected = useSetupStore((state) => state.gitlabConnected)
  const gitlabUsername = useSetupStore((state) => state.gitlabUsername)
  const gitlabAvatarUrl = useSetupStore((state) => state.gitlabAvatarUrl)
  const clearGitLab = useSetupStore((state) => state.clearGitLab)

  const { mutate: deleteGitLabSecret } = useDeleteGitLabSecret()

  const handleDisconnect = () => {
    deleteGitLabSecret(undefined, {
      onSuccess: () => {
        clearGitLab()
      },
    })
  }

  return (
    <>
      <Card
        className={cn(
          'transition-all',
          gitlabConnected && 'border-green-500 bg-green-50 dark:bg-green-950/20'
        )}
      >
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div
                className={cn(
                  'rounded-full p-3 shrink-0',
                  gitlabConnected
                    ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <GitLabIcon />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold">GitLab</h3>
                {gitlabConnected && gitlabUsername ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="size-5 shrink-0">
                      <AvatarImage src={gitlabAvatarUrl || undefined} />
                      <AvatarFallback>
                        {gitlabUsername.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-muted-foreground truncate">
                      @{gitlabUsername}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Conecta tu cuenta para crear MRs
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {gitlabConnected ? (
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

      <GitLabTokenDialog
        open={showConnectDialog}
        onOpenChange={setShowConnectDialog}
      />
    </>
  )
}

// =============================================================================
// GitLab Token Dialog
// =============================================================================

interface GitLabTokenDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function GitLabTokenDialog({ open, onOpenChange }: GitLabTokenDialogProps) {
  const [patToken, setPatToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [patValidated, setPatValidated] = useState<{
    username: string
    avatarUrl?: string
  } | null>(null)

  const { mutate: validatePAT, isPending: isValidatingPAT, reset: resetPATValidation } = useValidateGitLabPAT()
  const { mutate: saveGitLabSecret, isPending: isSavingPAT } = useSaveGitLabSecret()
  const setGitLabConnected = useSetupStore((state) => state.setGitLabConnected)

  const [patError, setPatError] = useState<string | null>(null)

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

    saveGitLabSecret(
      {
        token: patToken.trim(),
        username: patValidated.username,
        avatarUrl: patValidated.avatarUrl,
      },
      {
        onSuccess: (result) => {
          if (result.success && result.username) {
            setGitLabConnected(result.username, result.avatarUrl ?? null)
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
          <DialogTitle>Conectar GitLab</DialogTitle>
          <DialogDescription>
            Ingresa un Personal Access Token para conectar tu cuenta
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-muted p-2">
              <Key className="size-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium">Personal Access Token</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Crea un token en{' '}
                <a
                  href="https://gitlab.com/-/user_settings/personal_access_tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  gitlab.com/...personal_access_tokens
                  <ExternalLink className="size-3" />
                </a>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Permisos requeridos: <code className="bg-muted px-1 rounded">api</code>,{' '}
                <code className="bg-muted px-1 rounded">read_user</code>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gitlab-pat-token">Token</Label>
            <div className="relative">
              <Input
                id="gitlab-pat-token"
                type={showToken ? 'text' : 'password'}
                placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
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
      </DialogContent>
    </Dialog>
  )
}
