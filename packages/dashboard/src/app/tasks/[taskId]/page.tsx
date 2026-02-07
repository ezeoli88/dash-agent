'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronRight, AlertCircle, FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useTask } from '@/features/tasks/hooks/use-task'
import { TaskDetail } from '@/features/tasks/components/task-detail'
import { TaskDetailSkeleton } from '@/features/tasks/components/task-detail-skeleton'
import { ApiClientError } from '@/lib/api-client'

export default function TaskDetailPage() {
  const params = useParams<{ taskId: string }>()
  const taskId = params.taskId

  const { data: task, isLoading, error } = useTask(taskId)

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Breadcrumb taskId={taskId} />
        <TaskDetailSkeleton />
      </div>
    )
  }

  // Not found state
  if (error instanceof ApiClientError && error.statusCode === 404) {
    return (
      <div className="space-y-6">
        <Breadcrumb taskId={taskId} />
        <NotFoundState taskId={taskId} />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <Breadcrumb taskId={taskId} />
        <ErrorState error={error} />
      </div>
    )
  }

  // No task data
  if (!task) {
    return (
      <div className="space-y-6">
        <Breadcrumb taskId={taskId} />
        <NotFoundState taskId={taskId} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumb taskId={taskId} taskTitle={task.title} />
      <TaskDetail task={task} />
    </div>
  )
}

function Breadcrumb({ taskId, taskTitle }: { taskId: string; taskTitle?: string }) {
  return (
    <nav className="flex items-center space-x-1 text-sm text-muted-foreground">
      <Link
        href="/board"
        className="hover:text-foreground transition-colors"
      >
        Tasks
      </Link>
      <ChevronRight className="h-4 w-4" />
      <span className="text-foreground font-medium truncate max-w-xs">
        {taskTitle || `Task ${taskId}`}
      </span>
    </nav>
  )
}

function NotFoundState({ taskId }: { taskId: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <FileQuestion className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Task Not Found</h2>
        <p className="text-muted-foreground text-center mb-6 max-w-md">
          The task with ID &quot;{taskId}&quot; could not be found. It may have been deleted or the ID is incorrect.
        </p>
        <Button asChild>
          <Link href="/board">Back to Tasks</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function ErrorState({ error }: { error: Error }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error Loading Task</h2>
        <p className="text-muted-foreground text-center mb-2 max-w-md">
          There was a problem loading the task details.
        </p>
        <p className="text-sm text-destructive mb-6 font-mono">
          {error.message}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try Again
          </Button>
          <Button asChild>
            <Link href="/board">Back to Tasks</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
