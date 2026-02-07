'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { taskKeys } from './query-keys'
import { tasksApi } from '@/lib/api-client'
import { toast } from 'sonner'
import { useTaskUIStore } from '../stores/task-ui-store'
import type { ActionResponse, RequestChangesResponse, PRMergedResponse, PRClosedResponse, CleanupWorktreeResponse } from '@/types/api'

export function useTaskActions(taskId: string) {
  const queryClient = useQueryClient()
  const router = useRouter()

  const invalidateTask = () => {
    queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
    queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
  }

  const execute = useMutation({
    mutationFn: (): Promise<ActionResponse> => tasksApi.execute(taskId),
    onSuccess: () => {
      toast.success('Task execution started')
      invalidateTask()
    },
    onError: (error: Error) => {
      toast.error(`Failed to execute task: ${error.message}`)
    },
  })

  const approve = useMutation({
    mutationFn: (): Promise<ActionResponse> => tasksApi.approve(taskId),
    onSuccess: (data) => {
      toast.success('Task approved successfully')
      if (data.pr_url) {
        toast.info(`PR available at: ${data.pr_url}`)
      }
      invalidateTask()
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve task: ${error.message}`)
    },
  })

  const cancel = useMutation({
    mutationFn: (): Promise<ActionResponse> => tasksApi.cancel(taskId),
    onSuccess: () => {
      toast.success('Task cancelled')
      invalidateTask()
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel task: ${error.message}`)
    },
  })

  const extend = useMutation({
    mutationFn: (): Promise<ActionResponse> => tasksApi.extend(taskId),
    onSuccess: (data) => {
      toast.success(data.message || 'Task timeout extended')
      invalidateTask()
    },
    onError: (error: Error) => {
      toast.error(`Failed to extend task: ${error.message}`)
    },
  })

  const sendFeedback = useMutation({
    mutationFn: (message: string): Promise<ActionResponse> => tasksApi.feedback(taskId, message),
    onSuccess: () => {
      toast.success('Feedback sent to agent')
    },
    onError: (error: Error) => {
      toast.error(`Failed to send feedback: ${error.message}`)
    },
  })

  const requestChanges = useMutation({
    mutationFn: (feedback: string): Promise<RequestChangesResponse> => tasksApi.requestChanges(taskId, feedback),
    onSuccess: (data) => {
      toast.success(data.message || 'Changes requested')
      invalidateTask()
    },
    onError: (error: Error) => {
      toast.error(`Failed to request changes: ${error.message}`)
    },
  })

  const markPRMerged = useMutation({
    mutationFn: (): Promise<PRMergedResponse> => tasksApi.markPRMerged(taskId),
    onSuccess: (data) => {
      toast.success(data.message || 'PR marked as merged')
      invalidateTask()
    },
    onError: (error: Error) => {
      toast.error(`Failed to mark PR as merged: ${error.message}`)
    },
  })

  const markPRClosed = useMutation({
    mutationFn: (): Promise<PRClosedResponse> => tasksApi.markPRClosed(taskId),
    onSuccess: (data) => {
      toast.success(data.message || 'PR marked as closed')
      invalidateTask()
    },
    onError: (error: Error) => {
      toast.error(`Failed to mark PR as closed: ${error.message}`)
    },
  })

  // Retry is the same as execute but with different messaging for failed tasks
  const retry = useMutation({
    mutationFn: (): Promise<ActionResponse> => tasksApi.execute(taskId),
    onSuccess: () => {
      toast.success('Retrying task execution')
      invalidateTask()
    },
    onError: (error: Error) => {
      toast.error(`Failed to retry task: ${error.message}`)
    },
  })

  // Cleanup worktree - discards all previous agent work
  const cleanupWorktree = useMutation({
    mutationFn: (): Promise<CleanupWorktreeResponse> => tasksApi.cleanupWorktree(taskId),
    onSuccess: () => {
      toast.success('Worktree cleaned up. Ready for fresh start.')
      invalidateTask()
    },
    onError: (error: Error) => {
      toast.error(`Failed to cleanup worktree: ${error.message}`)
    },
  })

  // Delete task - permanently removes the task
  const deleteTask = useMutation({
    mutationFn: (): Promise<void> => tasksApi.delete(taskId),
    onSuccess: () => {
      // Close drawer immediately before any query invalidation
      useTaskUIStore.getState().closeDrawer()
      toast.success('Task deleted')
      queryClient.removeQueries({ queryKey: taskKeys.detail(taskId) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
      router.push('/board')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete task: ${error.message}`)
    },
  })

  return { execute, approve, cancel, extend, sendFeedback, requestChanges, markPRMerged, markPRClosed, retry, cleanupWorktree, deleteTask }
}
