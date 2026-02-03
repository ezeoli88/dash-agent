import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl'

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
  xl: 'size-12',
}

interface LoadingSpinnerProps {
  size?: SpinnerSize
  className?: string
  label?: string
}

export function LoadingSpinner({
  size = 'md',
  className,
  label,
}: LoadingSpinnerProps) {
  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      <Loader2
        className={cn('animate-spin text-muted-foreground', sizeClasses[size])}
        aria-hidden="true"
      />
      {label && (
        <span className="text-sm text-muted-foreground">{label}</span>
      )}
      <span className="sr-only">{label || 'Loading...'}</span>
    </div>
  )
}

// Full page loading spinner
interface PageLoadingProps {
  label?: string
}

export function PageLoading({ label = 'Loading...' }: PageLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <LoadingSpinner size="xl" />
      <p className="text-muted-foreground">{label}</p>
    </div>
  )
}
