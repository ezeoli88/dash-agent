'use client'

import { useState, useCallback, useMemo } from 'react'
import { Lightbulb, Save, X, Loader2, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { toast } from 'sonner'
import { usePRComments } from '../hooks/use-pr-comments'
import { useAddPattern } from '@/features/repos/hooks'
import type { Task, PRComment } from '../types'

interface PatternSuggestionProps {
  task: Task
}

/**
 * Extracts a suggested pattern from PR comments
 * Looks for actionable feedback like "should", "always", "never", "please", etc.
 */
function extractSuggestedPattern(comments: PRComment[]): string {
  // Filter to recent comments that might contain feedback
  const feedbackComments = comments
    .filter((c) => {
      const body = c.body.toLowerCase()
      // Look for feedback indicators
      return (
        body.includes('should') ||
        body.includes('always') ||
        body.includes('never') ||
        body.includes('please') ||
        body.includes('instead') ||
        body.includes('prefer') ||
        body.includes('convention') ||
        body.includes('pattern') ||
        body.includes('style')
      )
    })
    .slice(0, 3) // Take top 3 most relevant

  if (feedbackComments.length === 0) {
    return ''
  }

  // Combine and summarize feedback
  const summaries = feedbackComments.map((c) => {
    // Take first sentence or first 150 chars
    const firstSentence = c.body.split(/[.!?]/)[0]?.trim() || ''
    return firstSentence.length > 150
      ? firstSentence.slice(0, 147) + '...'
      : firstSentence
  })

  return summaries.join('. ') + '.'
}

export function PatternSuggestion({ task }: PatternSuggestionProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [showComments, setShowComments] = useState(false)
  const [patternText, setPatternText] = useState('')
  const [hasInitialized, setHasInitialized] = useState(false)

  const shouldShow = task.status === 'changes_requested' && !!task.repository_id

  const {
    comments,
    isLoading: isLoadingComments,
  } = usePRComments({
    taskId: task.id,
    enabled: shouldShow,
  })

  const addPattern = useAddPattern()

  // Extract suggested pattern from comments
  const suggestedPattern = useMemo(() => {
    return extractSuggestedPattern(comments)
  }, [comments])

  // Initialize pattern text when comments load
  if (!hasInitialized && suggestedPattern && !patternText) {
    setPatternText(suggestedPattern)
    setHasInitialized(true)
  }

  const handleSave = useCallback(async () => {
    if (!patternText.trim()) {
      toast.error('Please enter a pattern to save')
      return
    }

    if (!task.repository_id) {
      toast.error('Task has no associated repository')
      return
    }

    try {
      await addPattern.mutateAsync({
        repoId: task.repository_id,
        pattern: patternText.trim(),
        taskId: task.id,
      })
      toast.success('Pattern saved successfully')
      setPatternText('')
      setIsOpen(false)
    } catch (error) {
      toast.error('Failed to save pattern')
      console.error('Error saving pattern:', error)
    }
  }, [patternText, task.repository_id, task.id, addPattern])

  const handleCancel = useCallback(() => {
    setPatternText('')
    setIsOpen(false)
  }, [])

  if (!shouldShow) {
    return null
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader className="py-3">
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full text-left">
              <CardTitle className="flex items-center gap-2 text-lg text-amber-800 dark:text-amber-200">
                <Lightbulb className="h-5 w-5" />
                Learn from this Feedback?
              </CardTitle>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-amber-600" />
              ) : (
                <ChevronDown className="h-4 w-4 text-amber-600" />
              )}
            </button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            <p className="text-sm text-muted-foreground">
              Changes were requested on this PR. Would you like to save a pattern so the
              PM Agent remembers this for future tasks?
            </p>

            {/* Show PR comments for context */}
            {comments.length > 0 && (
              <Collapsible open={showComments} onOpenChange={setShowComments}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {showComments ? 'Hide' : 'Show'} PR Comments ({comments.length})
                    {showComments ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-md border bg-background p-3 space-y-2">
                    {comments.map((comment) => (
                      <div key={comment.id} className="text-sm">
                        <span className="font-medium text-xs text-muted-foreground">
                          {comment.author.login}:
                        </span>
                        <p className="text-foreground mt-0.5 whitespace-pre-wrap">
                          {comment.body.length > 200
                            ? comment.body.slice(0, 197) + '...'
                            : comment.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {isLoadingComments && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading PR comments...
              </div>
            )}

            {/* Pattern input */}
            <div className="space-y-2">
              <Label htmlFor="pattern-text" className="text-sm font-medium">
                Pattern to remember
              </Label>
              <Textarea
                id="pattern-text"
                value={patternText}
                onChange={(e) => setPatternText(e.target.value)}
                placeholder="E.g., Always use TypeScript strict mode. Never use any type..."
                className="min-h-[80px] resize-none"
              />
              <p className="text-xs text-muted-foreground">
                This pattern will be included in future spec generation prompts for this repository.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={addPattern.isPending}
              >
                <X className="h-4 w-4 mr-1.5" />
                Skip
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={!patternText.trim() || addPattern.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {addPattern.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                Save Pattern
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
