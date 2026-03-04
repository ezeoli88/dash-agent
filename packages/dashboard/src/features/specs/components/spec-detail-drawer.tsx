'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Play,
  Check,
  RefreshCw,
  Trash2,
  X,
  Loader2,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { VisuallyHidden } from 'radix-ui'
import { toast } from 'sonner'

import { useTask } from '@/features/tasks/hooks/use-task'
import { useTaskActions } from '@/features/tasks/hooks/use-task-actions'
import { useSpecUIStore } from '../stores/spec-ui-store'
import { useApproveSpec } from '../hooks/use-approve-spec'
import { SpecStatusBadge } from './spec-status-badge'
import { SpecEditor } from './spec-editor'
import { SpecGenerationProgress } from './spec-generation-progress'
import { getAgentDisplayInfo } from '@/features/tasks/utils/agent-display'
import { tasksApi } from '@/lib/api-client'
import { cn } from '@/lib/utils'

const MIN_WIDTH_PX = 512
const MAX_WIDTH_VW = 0.5

export function SpecDetailDrawer() {
  const selectedSpecId = useSpecUIStore((s) => s.selectedSpecId)
  const closeDetail = useSpecUIStore((s) => s.closeDetail)
  const isOpen = !!selectedSpecId

  const { data: task, isLoading } = useTask(selectedSpecId ?? '')
  const taskActions = useTaskActions(selectedSpecId ?? '')
  const approveSpec = useApproveSpec()

  // Editable spec content for pending_approval
  const [editedSpec, setEditedSpec] = useState('')
  const [editedUserInput, setEditedUserInput] = useState('')
  const [isStarting, setIsStarting] = useState(false)

  // Sync spec content when task loads
  useEffect(() => {
    if (task) {
      setEditedSpec(task.generated_spec ?? task.final_spec ?? '')
      setEditedUserInput(task.user_input ?? '')
    }
  }, [task?.id, task?.generated_spec, task?.final_spec, task?.user_input])

  // Resizable width
  const [widthPx, setWidthPx] = useState(640)
  const isResizing = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const newWidth = window.innerWidth - e.clientX
      const maxPx = window.innerWidth * MAX_WIDTH_VW
      setWidthPx(Math.max(MIN_WIDTH_PX, Math.min(newWidth, maxPx)))
    }

    const handleMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  const handleGenerate = async () => {
    if (!selectedSpecId) return
    setIsStarting(true)
    try {
      await tasksApi.start(selectedSpecId)
      toast.success('Spec generation started')
    } catch (err) {
      toast.error(`Failed to start generation: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsStarting(false)
    }
  }

  const handleApprove = () => {
    if (!task) return
    approveSpec.mutate({
      taskId: task.id,
      finalSpec: editedSpec,
      wasEdited: editedSpec !== (task.generated_spec ?? ''),
    }, {
      onSuccess: () => closeDetail(),
    })
  }

  const agentInfo = task ? getAgentDisplayInfo(task.agent_type) : null

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeDetail()}>
      <SheetContent
        side="right"
        className="sm:!max-w-none w-full flex flex-col p-0 gap-0"
        style={{ width: widthPx }}
        showCloseButton={false}
      >
        {/* Resize handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/20 transition-colors z-10"
          onMouseDown={handleMouseDown}
        />

        <SheetHeader className="shrink-0 border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <VisuallyHidden.Root>
                <SheetTitle>Spec Detail</SheetTitle>
              </VisuallyHidden.Root>
              {task && <SpecStatusBadge status={task.status} />}
              {agentInfo && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {agentInfo.icon}
                  <span>{agentInfo.name}</span>
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon-xs" onClick={closeDetail}>
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        {isLoading || !task ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Content by status */}
            <div className="flex-1 overflow-auto">
              {task.status === 'draft' && (
                <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    <Label>Describe your idea</Label>
                    <Textarea
                      value={editedUserInput}
                      onChange={(e) => setEditedUserInput(e.target.value)}
                      placeholder="What do you want to build?"
                      className="min-h-[160px] resize-none"
                    />
                  </div>
                </div>
              )}

              {task.status === 'refining' && (
                <SpecGenerationProgress task={task} className="h-full" />
              )}

              {task.status === 'pending_approval' && (
                <SpecEditor
                  value={editedSpec}
                  onChange={setEditedSpec}
                  className="h-full"
                />
              )}
            </div>

            {/* Footer actions */}
            <div className="shrink-0 border-t px-6 py-3 flex items-center justify-between bg-muted/30">
              <div>
                {task.status === 'draft' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="size-4 mr-1.5" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete spec?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this specification. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            taskActions.deleteTask.mutate(undefined, {
                              onSuccess: () => closeDetail(),
                            })
                          }}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {task.status === 'refining' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => taskActions.cancel.mutate()}
                    disabled={taskActions.cancel.isPending}
                  >
                    <X className="size-4 mr-1.5" />
                    Cancel
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {task.status === 'draft' && (
                  <Button
                    onClick={handleGenerate}
                    disabled={isStarting || !editedUserInput.trim()}
                  >
                    {isStarting ? (
                      <>
                        <Loader2 className="size-4 mr-1.5 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Play className="size-4 mr-1.5" />
                        Generate Spec
                      </>
                    )}
                  </Button>
                )}

                {task.status === 'pending_approval' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerate}
                      disabled={isStarting}
                    >
                      <RefreshCw className={cn('size-4 mr-1.5', isStarting && 'animate-spin')} />
                      Regenerate
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleApprove}
                      disabled={approveSpec.isPending || !editedSpec.trim()}
                    >
                      {approveSpec.isPending ? (
                        <>
                          <Loader2 className="size-4 mr-1.5 animate-spin" />
                          Approving...
                        </>
                      ) : (
                        <>
                          <Check className="size-4 mr-1.5" />
                          Approve Spec
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
