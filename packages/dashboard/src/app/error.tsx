'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, RefreshCw, Home, Bug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: ErrorProps) {
  const [showDetails, setShowDetails] = useState(false)
  const isDevelopment = process.env.NODE_ENV === 'development'

  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-destructive/10 p-4 mb-4">
              <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
            </div>

            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>

            <p className="text-muted-foreground mb-4 max-w-sm">
              An unexpected error occurred. Please try again or contact support if the problem persists.
            </p>

            {error.digest && (
              <p className="text-xs text-muted-foreground mb-4 font-mono bg-muted px-2 py-1 rounded">
                Error ID: {error.digest}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mb-4">
              <Button onClick={reset} className="w-full sm:w-auto">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/tasks">
                  <Home className="h-4 w-4 mr-2" />
                  Go to Tasks
                </Link>
              </Button>
            </div>

            {/* Development mode: Show stack trace */}
            {isDevelopment && error.stack && (
              <Collapsible
                open={showDetails}
                onOpenChange={setShowDetails}
                className="w-full"
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                  >
                    <Bug className="h-3 w-3 mr-1" />
                    {showDetails ? 'Hide' : 'Show'} Technical Details
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="bg-muted rounded-md p-3 text-left overflow-x-auto">
                    <p className="text-sm font-medium text-destructive mb-2">
                      {error.name}: {error.message}
                    </p>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                      {error.stack}
                    </pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
