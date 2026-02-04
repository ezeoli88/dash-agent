'use client'

import { useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { MessageSquare, FileCode, ExternalLink, RefreshCw, CheckCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { usePRComments } from '../hooks/use-pr-comments'
import { useTaskSSE } from '../hooks/use-task-sse'
import { useTaskUIStore } from '../stores/task-ui-store'
import type { Task, PRComment } from '../types'

interface PRCommentsProps {
  task: Task
}

function CommentSkeleton() {
  return (
    <div className="flex gap-3 p-4 border-b last:border-b-0">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  )
}

interface CommentItemProps {
  comment: PRComment
  isUnread: boolean
  onMarkAsRead: () => void
}

function CommentItem({ comment, isUnread, onMarkAsRead }: CommentItemProps) {
  const initials = comment.author.login.slice(0, 2).toUpperCase()

  // Mark as read when the comment is viewed (hovered or clicked)
  const handleInteraction = useCallback(() => {
    if (isUnread) {
      onMarkAsRead()
    }
  }, [isUnread, onMarkAsRead])

  return (
    <div
      className={cn(
        "relative flex gap-3 p-4 border-b last:border-b-0 hover:bg-muted/50 transition-colors",
        isUnread && "bg-blue-50/50 dark:bg-blue-950/20"
      )}
      onMouseEnter={handleInteraction}
      onClick={handleInteraction}
    >
      {isUnread && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-blue-500" />
      )}
      <Avatar className="h-8 w-8">
        <AvatarImage src={comment.author.avatarUrl} alt={comment.author.login} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{comment.author.login}</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
          {comment.isReviewComment && (
            <Badge variant="outline" className="text-xs gap-1">
              <FileCode className="h-3 w-3" />
              {comment.path && (
                <span className="truncate max-w-[150px]">{comment.path}</span>
              )}
              {comment.line && <span>:{comment.line}</span>}
            </Badge>
          )}
        </div>
        <div className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words">
          {comment.body}
        </div>
        <div className="mt-2">
          <a
            href={comment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  )
}

export function PRComments({ task }: PRCommentsProps) {
  const hasPR = !!task.pr_url
  const shouldShowComments = hasPR && ['pr_created', 'changes_requested', 'done'].includes(task.status)

  const {
    comments,
    totalCount,
    isLoading,
    isError,
    addComment,
    refetch,
  } = usePRComments({
    taskId: task.id,
    enabled: shouldShowComments,
  })

  // Unread comments state
  const {
    unreadComments,
    addUnreadComment,
    markCommentAsRead,
    markAllCommentsAsRead,
    getUnreadCount,
  } = useTaskUIStore()

  const unreadCount = getUnreadCount(task.id)
  const taskUnreadIds = unreadComments[task.id] || []

  // Subscribe to SSE for real-time comment updates
  const { } = useTaskSSE({
    taskId: task.id,
    enabled: shouldShowComments,
    onPRComment: (comment) => {
      // Add comment to cache
      addComment(comment)
      // Mark as unread
      addUnreadComment(task.id, comment.id)
      // Show toast notification
      toast.info(`New comment from ${comment.author.login}`, {
        description: comment.body.length > 100
          ? comment.body.slice(0, 100) + '...'
          : comment.body,
        action: {
          label: 'View',
          onClick: () => window.open(comment.url, '_blank'),
        },
      })
    },
  })

  if (!shouldShowComments) {
    return null
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5" />
            PR Comments
            {totalCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {totalCount}
              </Badge>
            )}
            {unreadCount > 0 && (
              <Badge variant="default" className="ml-1 bg-blue-500">
                {unreadCount} new
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllCommentsAsRead(task.id)}
                title="Mark all as read"
              >
                <CheckCheck className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && (
          <div>
            <CommentSkeleton />
            <CommentSkeleton />
          </div>
        )}

        {isError && (
          <div className="p-4 text-center text-muted-foreground">
            <p className="text-sm">Failed to load comments</p>
            <Button variant="link" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        )}

        {!isLoading && !isError && comments.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No comments yet</p>
            <p className="text-xs mt-1">
              Comments on the PR will appear here
            </p>
          </div>
        )}

        {!isLoading && !isError && comments.length > 0 && (
          <div className="max-h-[400px] overflow-y-auto">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                isUnread={taskUnreadIds.includes(comment.id)}
                onMarkAsRead={() => markCommentAsRead(task.id, comment.id)}
              />
            ))}
          </div>
        )}

        {hasPR && (
          <div className="p-3 border-t bg-muted/30">
            <a
              href={task.pr_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Open PR on GitHub
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
