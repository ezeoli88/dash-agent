'use client'

import { cn } from '@/lib/utils'
import { Layers } from 'lucide-react'

interface LoadingPageProps {
  message?: string
  className?: string
  showLogo?: boolean
}

/**
 * Consistent loading page component for full-page loading states.
 * Used in loading.tsx files for Suspense boundaries.
 */
export function LoadingPage({
  message = 'Loading...',
  className,
  showLogo = false,
}: LoadingPageProps) {
  return (
    <div
      className={cn(
        'flex min-h-[50vh] flex-col items-center justify-center',
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="flex flex-col items-center space-y-4">
        {showLogo && (
          <Layers className="h-10 w-10 text-primary animate-pulse" />
        )}
        <div
          className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

interface LoadingSpinnerInlineProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Inline loading spinner for buttons, cells, etc.
 */
export function LoadingSpinnerInline({
  size = 'md',
  className,
}: LoadingSpinnerInlineProps) {
  const sizeClasses = {
    sm: 'h-3 w-3 border-2',
    md: 'h-4 w-4 border-2',
    lg: 'h-6 w-6 border-3',
  }

  return (
    <div
      className={cn(
        'animate-spin rounded-full border-primary border-t-transparent',
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label="Loading"
    />
  )
}
