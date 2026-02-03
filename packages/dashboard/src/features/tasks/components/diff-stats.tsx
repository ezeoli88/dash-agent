'use client'

import { Plus, Minus, Files } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DiffStatsProps {
  additions: number
  deletions: number
  filesChanged: number
  className?: string
}

export function DiffStats({ additions, deletions, filesChanged, className }: DiffStatsProps) {
  const total = additions + deletions
  const additionPercentage = total > 0 ? (additions / total) * 100 : 50

  return (
    <div className={cn('flex items-center gap-4', className)}>
      {/* Additions */}
      <div className="flex items-center gap-1.5">
        <Plus className="size-4 text-green-600 dark:text-green-400" />
        <span className="font-mono text-sm font-medium text-green-600 dark:text-green-400">
          {additions.toLocaleString()}
        </span>
      </div>

      {/* Deletions */}
      <div className="flex items-center gap-1.5">
        <Minus className="size-4 text-red-600 dark:text-red-400" />
        <span className="font-mono text-sm font-medium text-red-600 dark:text-red-400">
          {deletions.toLocaleString()}
        </span>
      </div>

      {/* Visual bar */}
      <div className="hidden sm:flex items-center gap-0.5 h-2 w-24 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 dark:bg-green-400 transition-all duration-300"
          style={{ width: `${additionPercentage}%` }}
        />
        <div
          className="h-full bg-red-500 dark:bg-red-400 transition-all duration-300"
          style={{ width: `${100 - additionPercentage}%` }}
        />
      </div>

      {/* Files changed */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Files className="size-4" />
        <span className="text-sm">
          {filesChanged} {filesChanged === 1 ? 'file' : 'files'} changed
        </span>
      </div>
    </div>
  )
}

/**
 * Compact version for smaller spaces
 */
export function DiffStatsCompact({ additions, deletions, filesChanged, className }: DiffStatsProps) {
  return (
    <div className={cn('flex items-center gap-2 text-xs', className)}>
      <span className="font-mono text-green-600 dark:text-green-400">+{additions}</span>
      <span className="font-mono text-red-600 dark:text-red-400">-{deletions}</span>
      <span className="text-muted-foreground">({filesChanged} files)</span>
    </div>
  )
}

/**
 * Detailed stats with breakdown by file type (optional)
 */
export function DiffStatsDetailed({
  additions,
  deletions,
  filesChanged,
  className,
}: DiffStatsProps) {
  const total = additions + deletions
  const additionPercentage = total > 0 ? (additions / total) * 100 : 50
  const netChange = additions - deletions

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Plus className="size-4 text-green-600 dark:text-green-400" />
            <span className="font-mono text-lg font-bold text-green-600 dark:text-green-400">
              {additions.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">additions</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Minus className="size-4 text-red-600 dark:text-red-400" />
            <span className="font-mono text-lg font-bold text-red-600 dark:text-red-400">
              {deletions.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">deletions</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Files className="size-4" />
          <span className="text-sm font-medium">
            {filesChanged} {filesChanged === 1 ? 'file' : 'files'}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 dark:bg-green-400 transition-all duration-300"
            style={{ width: `${additionPercentage}%` }}
          />
          <div
            className="h-full bg-red-500 dark:bg-red-400 transition-all duration-300"
            style={{ width: `${100 - additionPercentage}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{additionPercentage.toFixed(0)}% additions</span>
          <span
            className={cn(
              'font-mono',
              netChange > 0
                ? 'text-green-600 dark:text-green-400'
                : netChange < 0
                  ? 'text-red-600 dark:text-red-400'
                  : ''
            )}
          >
            {netChange > 0 ? '+' : ''}
            {netChange.toLocaleString()} net
          </span>
        </div>
      </div>
    </div>
  )
}
