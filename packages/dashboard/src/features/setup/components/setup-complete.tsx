'use client'

import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Check, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSetupStatus } from '../hooks/use-setup-status'
import { AI_PROVIDER_INFO } from '../types'

export function SetupComplete() {
  const router = useRouter()
  const [countdown, setCountdown] = useState(5)
  const { aiProvider, githubUsername } = useSetupStatus()

  const providerInfo = aiProvider ? AI_PROVIDER_INFO[aiProvider] : null

  useEffect(() => {
    if (countdown <= 0) {
      router.navigate({ to: '/board' })
      return
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown, router])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mx-auto max-w-md text-center">
        {/* Success animation */}
        <div className="mb-8">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <Check className="size-10 text-green-600 dark:text-green-400" />
          </div>
        </div>

        {/* Title */}
        <h1 className="mb-4 text-3xl font-bold">Todo listo!</h1>
        <p className="mb-8 text-lg text-muted-foreground">
          Tu dash-agent esta configurado y listo para usar.
        </p>

        {/* Summary */}
        <div className="mb-8 rounded-lg border bg-card p-4 text-left">
          <h2 className="mb-3 font-semibold">Resumen de configuracion</h2>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-sm">
              <Check className="size-4 text-green-500" />
              <span>
                Proveedor de IA:{' '}
                <span className="font-medium">{providerInfo?.name || 'No configurado'}</span>
              </span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Check className="size-4 text-green-500" />
              <span>
                GitHub:{' '}
                <span className="font-medium">@{githubUsername || 'No conectado'}</span>
              </span>
            </li>
          </ul>
        </div>

        {/* CTA */}
        <div className="space-y-4">
          <Button
            size="lg"
            className="w-full"
            onClick={() => router.navigate({ to: '/board' })}
          >
            <Rocket className="mr-2 size-4" />
            Ir al Dashboard
          </Button>
          <p className="text-sm text-muted-foreground">
            Redirigiendo automaticamente en {countdown} segundos...
          </p>
        </div>
      </div>
    </div>
  )
}
