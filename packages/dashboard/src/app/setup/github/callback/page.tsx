'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGitHubCallback, useSetupStatus } from '@/features/setup'

export default function GitHubCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { handleCallback, isConnecting } = useGitHubCallback()
  const { isComplete } = useSetupStatus()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Handle OAuth errors from GitHub
    if (error) {
      setStatus('error')
      setErrorMessage(
        error === 'access_denied'
          ? 'Acceso denegado. Por favor, intenta de nuevo.'
          : `Error de GitHub: ${error}`
      )
      return
    }

    // Validate parameters
    if (!code || !state) {
      setStatus('error')
      setErrorMessage('Parametros de OAuth invalidos. Por favor, intenta de nuevo.')
      return
    }

    // Validate state matches what we stored
    const storedState = sessionStorage.getItem('github-oauth-state')
    if (state !== storedState) {
      setStatus('error')
      setErrorMessage('Token de estado invalido. Por favor, intenta de nuevo.')
      return
    }

    // Clear stored state
    sessionStorage.removeItem('github-oauth-state')

    // Process the callback
    handleCallback(
      { code, state },
      {
        onSuccess: (response) => {
          if (response.success) {
            setStatus('success')
            // Redirect after short delay
            setTimeout(() => {
              router.push('/setup')
            }, 1500)
          } else {
            setStatus('error')
            setErrorMessage(response.error || 'Error al conectar con GitHub')
          }
        },
        onError: (err) => {
          setStatus('error')
          setErrorMessage(err.message || 'Error al procesar el callback')
        },
      }
    )
  }, [searchParams, handleCallback, router])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mx-auto max-w-md text-center">
        {status === 'processing' && (
          <>
            <Loader2 className="mx-auto mb-4 size-12 animate-spin text-primary" />
            <h1 className="mb-2 text-2xl font-bold">Conectando con GitHub...</h1>
            <p className="text-muted-foreground">
              Por favor espera mientras verificamos tu cuenta.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Check className="size-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="mb-2 text-2xl font-bold">GitHub conectado!</h1>
            <p className="text-muted-foreground">
              Redirigiendo a la configuracion...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <X className="size-8 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="mb-2 text-2xl font-bold">Error de conexion</h1>
            <p className="mb-6 text-muted-foreground">
              {errorMessage || 'Ocurrio un error al conectar con GitHub.'}
            </p>
            <Button onClick={() => router.push('/setup')}>
              Volver a la configuracion
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
