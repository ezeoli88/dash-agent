'use client'

import { FileText, ScrollText, GitPullRequest, MessageSquarePlus, MessageSquare, Loader2, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getAgentDisplayInfo } from '../utils/agent-display'
import type { Task } from '../types'
import { TaskHeader } from './task-header'
import { TaskMetadata } from './task-metadata'
import { TaskDescription } from './task-description'
import { TaskActions } from './task-actions'
import { TaskLogs } from './task-logs'
import { TaskDiff } from './task-diff'
import { FeedbackSection } from './feedback-section'
import { PRComments } from './pr-comments'
import { SpecEditor } from './spec-editor'
import { PatternSuggestion } from './pattern-suggestion'
import { AgentModelSelector } from './agent-model-selector'
import { useTaskUIStore } from '../stores/task-ui-store'

interface TaskDetailProps {
  task: Task
}

export function TaskDetail({ task }: TaskDetailProps) {
  const agentInfo = getAgentDisplayInfo(task.agent_type)

  // Two-agent workflow: Check if we're in spec phase
  const isInSpecPhase = task.status === 'pending_approval'
  const isRefiningSpec = task.status === 'refining'
  const isDraft = task.status === 'draft'

  // Determine if logs should be shown (active tasks)
  // Updated for two-agent workflow: includes coding phase and legacy statuses
  const isActiveTask =
    task.status === 'planning' ||
    task.status === 'in_progress' ||
    task.status === 'coding' ||
    task.status === 'refining'

  // Determine if changes tab should be enabled
  // Changes are available for tasks that have progressed past the coding phase
  // Updated for two-agent workflow
  const showChangesTab =
    task.status === 'awaiting_review' ||
    task.status === 'approved' ||
    task.status === 'pr_created' ||
    task.status === 'changes_requested' ||
    task.status === 'review' ||
    task.status === 'done' ||
    task.status === 'failed'

  // Show PR comments tab when task has a PR
  const showCommentsTab = !!task.pr_url && ['pr_created', 'review', 'changes_requested', 'done'].includes(task.status)

  // Get unread comments count
  const unreadCount = useTaskUIStore((state) => state.getUnreadCount(task.id))

  // Determine default tab based on task status
  // For spec phase, show overview. For coding phase, show logs.
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
              <TabsTrigger value="comments" className="gap-1.5" disabled={!showCommentsTab}>
                <MessageSquare className="size-4" />
                Comments
                {unreadCount > 0 && (
                  <Badge variant="default" className="ml-1 h-5 min-w-5 bg-blue-500 px-1.5 text-xs">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-0">
              {/* Show refining state with spinner */}
              {isRefiningSpec && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <div className="flex items-center gap-3 mb-4">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <Sparkles className="h-6 w-6 text-primary animate-pulse" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">PM Agent is working...</h3>
                    <p className="text-muted-foreground text-center max-w-md">
                      Analyzing the repository and generating a detailed specification for your request.
                      This usually takes 30-60 seconds.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Show SpecEditor when spec is ready for review */}
              {isInSpecPhase && (
                <SpecEditor task={task} />
              )}

              {/* Show description for non-refining states */}
              {/* In pending_approval, show below the spec so user can edit and rebuild */}
              {!isRefiningSpec && !isInSpecPhase && (
                <TaskDescription task={task} showRebuildSpec />
              )}
              {isInSpecPhase && (
                <TaskDescription task={task} showRebuildSpec />
              )}

              {/* Agent / Model selector */}
              <AgentModelSelector task={task} />

              {/* Show pattern suggestion when changes were requested */}
              {task.status === 'changes_requested' && task.repository_id && (
                <PatternSuggestion task={task} />
              )}

              <TaskMetadata task={task} />

              {/* Show Feedback Section in Overview for active coding tasks */}
              {isActiveTask && !isRefiningSpec && (
                <FeedbackSection task={task} />
              )}
            </TabsContent>

            <TabsContent value="logs" className="mt-0">
              <Card className="overflow-hidden">
                <CardHeader className="py-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ScrollText className="h-5 w-5" />
                    Execution Logs
                    {task.agent_type && (
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-normal',
                        agentInfo?.colorClasses.bg ?? 'bg-muted',
                        agentInfo?.colorClasses.text ?? 'text-muted-foreground'
                      )}>
                        {agentInfo?.icon} {agentInfo?.name ?? task.agent_type}
                      </span>
                    )}
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

            <TabsContent value="comments" className="mt-0">
              {showCommentsTab ? (
                <PRComments task={task} />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <MessageSquare className="h-5 w-5" />
                      PR Comments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-sm">No PR created yet.</p>
                      <p className="text-xs mt-1">Comments will appear here once a PR is created.</p>
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
