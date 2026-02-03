import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function TasksLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page header skeleton */}
      <div>
        <Skeleton className="h-9 w-32 mb-2" />
        <Skeleton className="h-5 w-64" />
      </div>

      {/* Filters skeleton */}
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-16" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Skeleton className="h-9 w-[200px]" />
            <Skeleton className="h-9 w-[140px]" />
            <Skeleton className="h-9 w-24" />
          </div>
        </CardContent>
      </Card>

      {/* Task list skeleton */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
