'use client'

import { FileText, ScrollText, GitPullRequest, MessageSquarePlus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Task } from '../types'
import { TaskHeader } from './task-header'
import { TaskMetadata } from './task-metadata'
import { TaskDescription } from './task-description'
import { TaskActions } from './task-actions'
import { TaskLogs } from './task-logs'
import { TaskDiff } from './task-diff'
import { FeedbackSection } from './feedback-section'

interface TaskDetailProps {
  task: Task
}

export function TaskDetail({ task }: TaskDetailProps) {
  // Determine if logs should be shown (active tasks)
  const isActiveTask = task.status === 'planning' || task.status === 'in_progress'

  // Determine if changes tab should be enabled
  // Changes are available for tasks that have progressed past the initial execution phase
  // This includes: awaiting_review, approved, pr_created, changes_requested, done, and failed
  // (failed tasks may have partial changes that the user wants to see)
  const showChangesTab =
    task.status === 'awaiting_review' ||
    task.status === 'approved' ||
    task.status === 'pr_created' ||
    task.status === 'changes_requested' ||
    task.status === 'done' ||
    task.status === 'failed'

  // Determine default tab based on task status
  const defaultTab = isActiveTask ? 'logs' : 'overview'

  return (
    <div className="space-y-6">
      {/* Header with back button, title, status, and repo link */}
      <TaskHeader task={task} />

      {/* Main content area */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column - Tabs with Overview, Logs, Changes */}
        <div className="lg:col-span-2">
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList variant="line" className="mb-4">
              <TabsTrigger value="overview" className="gap-1.5">
                <FileText className="size-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="logs" className="gap-1.5">
                <ScrollText className="size-4" />
                Logs
                {isActiveTask && (
                  <span className="ml-1 size-2 rounded-full bg-green-500 animate-pulse" />
                )}
              </TabsTrigger>
              <TabsTrigger value="changes" className="gap-1.5" disabled={!showChangesTab}>
                <GitPullRequest className="size-4" />
                Changes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-0">
              <TaskDescription task={task} />
              <TaskMetadata task={task} />

              {/* Show Feedback Section in Overview for active tasks */}
              {isActiveTask && (
                <FeedbackSection task={task} />
              )}
            </TabsContent>

            <TabsContent value="logs" className="mt-0">
              <Card className="overflow-hidden">
                <CardHeader className="py-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ScrollText className="h-5 w-5" />
                    Execution Logs
                    {isActiveTask && (
                      <span className="flex items-center gap-1 text-xs font-normal text-emerald-500">
                        <MessageSquarePlus className="size-3.5" />
                        Feedback enabled
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="h-[500px]">
                    <TaskLogs
                      task={task}
                      enabled={true}
                      showFeedbackForm={true}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="changes" className="mt-0">
              {showChangesTab ? (
                <TaskDiff taskId={task.id} />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <GitPullRequest className="h-5 w-5" />
                      Code Changes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                      <GitPullRequest className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-sm">No changes available yet.</p>
                      <p className="text-xs mt-1">Execute the task to generate changes.</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right column - Actions */}
        <div>
          <TaskActions task={task} />
        </div>
      </div>
    </div>
  )
}
