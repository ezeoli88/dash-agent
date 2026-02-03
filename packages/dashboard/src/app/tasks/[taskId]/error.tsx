'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, RefreshCw, ArrowLeft, Bug, ChevronRight } from 'lucide-react'
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

export default function TaskDetailError({ error, reset }: ErrorProps) {
  const [showDetails, setShowDetails] = useState(false)
  const isDevelopment = process.env.NODE_ENV === 'development'

  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Task detail error:', error)
  }, [error])

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav
        className="flex items-center space-x-1 text-sm text-muted-foreground"
        aria-label="Breadcrumb"
      >
        <Link
          href="/tasks"
          className="hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
        >
          Tasks
        </Link>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
        <span className="text-foreground font-medium">Error</span>
      </nav>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
          </div>

          <h1 className="text-xl font-semibold mb-2">Failed to Load Task</h1>

          <p className="text-muted-foreground text-center mb-2 max-w-md">
            We couldn&apos;t load the task details. This might be a temporary issue with the server.
          </p>

          {/* Always show error message */}
          <p className="text-sm text-destructive mb-4 font-mono bg-muted px-2 py-1 rounded max-w-md text-center">
            {error.message || 'Unknown error'}
          </p>

          {error.digest && (
            <p className="text-xs text-muted-foreground mb-4 font-mono bg-muted px-2 py-1 rounded">
              Error ID: {error.digest}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Button onClick={reset}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button variant="outline" asChild>
              <Link href="/tasks">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Tasks
              </Link>
            </Button>
          </div>

          {/* Development mode: Show stack trace */}
          {isDevelopment && error.stack && (
            <Collapsible
              open={showDetails}
              onOpenChange={setShowDetails}
              className="w-full max-w-2xl"
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
        </CardContent>
      </Card>
    </div>
  )
}
