import { Skeleton } from '@/components/ui/skeleton'

interface TaskListSkeletonProps {
  count?: number
}

export function TaskListSkeleton({ count = 5 }: TaskListSkeletonProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <TaskListItemSkeleton key={i} />
      ))}
    </div>
  )
}

function TaskListItemSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      {/* Status indicator skeleton */}
      <Skeleton className="h-2 w-2 shrink-0 rounded-full" />

      {/* Content skeleton */}
      <div className="min-w-0 flex-1 space-y-2">
        {/* Title */}
        <Skeleton className="h-4 w-3/4" />
        {/* Repo and time */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>

      {/* Status badge skeleton */}
      <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
    </div>
  )
}
