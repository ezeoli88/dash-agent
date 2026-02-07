'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface InlineEditProps {
  value: string
  onSave: (value: string) => Promise<void>
  /** Whether the field is currently saving */
  isSaving?: boolean
  /** Use a textarea instead of an input (for multi-line content) */
  multiline?: boolean
  /** Minimum length for validation */
  minLength?: number
  /** Placeholder text when the value is empty */
  placeholder?: string
  /** Additional className for the display text */
  displayClassName?: string
  /** Additional className for the input/textarea */
  inputClassName?: string
  /** Whether editing is disabled (e.g., task is in a terminal state) */
  disabled?: boolean
}

export function InlineEdit({
  value,
  onSave,
  isSaving = false,
  multiline = false,
  minLength = 1,
  placeholder = 'Click to edit...',
  displayClassName,
  inputClassName,
  disabled = false,
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  // Sync external value changes when not editing
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value)
    }
  }, [value, isEditing])

  // Focus the input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      // Place cursor at the end
      const length = inputRef.current.value.length
      inputRef.current.setSelectionRange(length, length)
    }
  }, [isEditing])

  const startEditing = useCallback(() => {
    if (disabled || isSaving) return
    setEditValue(value)
    setIsEditing(true)
  }, [disabled, isSaving, value])

  const cancelEditing = useCallback(() => {
    setEditValue(value)
    setIsEditing(false)
  }, [value])

  const handleSave = useCallback(async () => {
    const trimmed = editValue.trim()
    if (trimmed.length < minLength) return
    if (trimmed === value) {
      // No changes, just exit edit mode
      setIsEditing(false)
      return
    }

    try {
      await onSave(trimmed)
      setIsEditing(false)
    } catch {
      // Error is handled by the parent (toast, etc.)
      // Stay in edit mode so the user can retry
    }
  }, [editValue, minLength, value, onSave])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelEditing()
      }
      // For single-line inputs, Enter saves
      // For multiline, Ctrl+Enter or Cmd+Enter saves
      if (e.key === 'Enter') {
        if (!multiline) {
          e.preventDefault()
          handleSave()
        } else if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          handleSave()
        }
      }
    },
    [multiline, handleSave, cancelEditing]
  )

  const isValid = editValue.trim().length >= minLength

  // Editing mode
  if (isEditing) {
    return (
      <div className="space-y-2">
        {multiline ? (
          <Textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            placeholder={placeholder}
            className={cn('min-h-[120px] resize-y', inputClassName)}
          />
        ) : (
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            placeholder={placeholder}
            className={inputClassName}
          />
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isValid || isSaving}
            className="h-7 gap-1 px-2.5 text-xs"
          >
            {isSaving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={cancelEditing}
            disabled={isSaving}
            className="h-7 gap-1 px-2.5 text-xs"
          >
            <X className="size-3.5" />
            Cancel
          </Button>
          {multiline && (
            <span className="text-xs text-muted-foreground ml-auto">
              Ctrl+Enter to save, Escape to cancel
            </span>
          )}
          {!multiline && (
            <span className="text-xs text-muted-foreground ml-auto">
              Enter to save, Escape to cancel
            </span>
          )}
        </div>
      </div>
    )
  }

  // Display mode
  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className={cn(
        'group relative inline-flex w-full cursor-pointer items-start text-left transition-colors',
        'rounded-md -mx-1.5 px-1.5 -my-0.5 py-0.5',
        !disabled && 'hover:bg-muted/50',
        disabled && 'cursor-default',
        displayClassName
      )}
      title={disabled ? undefined : 'Click to edit'}
    >
      <span className={cn('flex-1', !value && 'text-muted-foreground italic')}>
        {value || placeholder}
      </span>
      {!disabled && (
        <Pencil
          className={cn(
            'ml-2 mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity',
            'group-hover:opacity-100'
          )}
        />
      )}
    </button>
  )
}
