'use client'

import { Link, useParams } from '@tanstack/react-router'
import { ChevronRight, ArrowLeft, AlertCircle, FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useTask } from '@/features/tasks/hooks/use-task'
import { TaskDiff, TaskDiffSkeleton } from '@/features/tasks/components/task-diff'
import { ApiClientError } from '@/lib/api-client'

export default function DiffPage() {
  const { taskId } = useParams({ strict: false }) as { taskId: string }

  const { data: task, isLoading, error } = useTask(taskId)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Breadcrumb taskId={taskId} />
        <TaskDiffSkeleton />
      </div>
    )
  }

  if (error instanceof ApiClientError && error.statusCode === 404) {
    return (
      <div className="space-y-6">
        <Breadcrumb taskId={taskId} />
        <NotFoundState taskId={taskId} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Breadcrumb taskId={taskId} />
        <ErrorState error={error} />
      </div>
    )
  }

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
      <div className="flex items-center justify-between">
        <Breadcrumb taskId={taskId} taskTitle={task.title} />
        <Button variant="outline" size="sm" asChild>
          <Link to="/board">
            <ArrowLeft className="mr-1.5 size-3.5" />
            Back to Board
          </Link>
        </Button>
      </div>
      <TaskDiff taskId={taskId} />
    </div>
  )
}

function Breadcrumb({ taskId, taskTitle }: { taskId: string; taskTitle?: string }) {
  return (
    <nav className="flex items-center space-x-1 text-sm text-muted-foreground">
      <Link to="/board" className="hover:text-foreground transition-colors">
        Tasks
      </Link>
      <ChevronRight className="h-4 w-4" />
      <Link to="/board" className="hover:text-foreground transition-colors">
        {taskTitle || `Task ${taskId}`}
      </Link>
      <ChevronRight className="h-4 w-4" />
      <span className="text-foreground font-medium">Diff</span>
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
          The task with ID &quot;{taskId}&quot; could not be found.
        </p>
        <Button asChild>
          <Link to="/board">Back to Tasks</Link>
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
        <h2 className="text-xl font-semibold mb-2">Error Loading Diff</h2>
        <p className="text-muted-foreground text-center mb-2 max-w-md">
          There was a problem loading the changes.
        </p>
        <p className="text-sm text-destructive mb-6 font-mono">
          {error.message}
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </CardContent>
    </Card>
  )
}
