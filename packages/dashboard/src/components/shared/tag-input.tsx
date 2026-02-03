'use client'

import { useState, useRef, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface TagInputProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function TagInput({
  value,
  onChange,
  placeholder = 'Add a tag...',
  className,
  disabled = false,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim()
    if (trimmedTag && !value.includes(trimmedTag)) {
      onChange([...value, trimmedTag])
    }
    setInputValue('')
  }

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (inputValue.trim()) {
        addTag(inputValue)
      }
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    // If user types a comma, add the tag
    if (newValue.includes(',')) {
      const parts = newValue.split(',')
      const tagToAdd = parts[0]
      if (tagToAdd.trim()) {
        addTag(tagToAdd)
      }
      setInputValue(parts.slice(1).join(','))
    } else {
      setInputValue(newValue)
    }
  }

  const handleContainerClick = () => {
    inputRef.current?.focus()
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 min-h-[42px] cursor-text',
        'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
      onClick={handleContainerClick}
    >
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeTag(tag)
              }}
              className="ml-1 rounded-full outline-none hover:bg-gray-300 dark:hover:bg-gray-600 focus:ring-2 focus:ring-ring"
            >
              <X className="h-3 w-3" />
              <span className="sr-only">Remove {tag}</span>
            </button>
          )}
        </Badge>
      ))}
      <Input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ''}
        disabled={disabled}
        className="flex-1 min-w-[120px] border-0 p-0 h-auto shadow-none focus-visible:ring-0 focus-visible:border-0"
      />
    </div>
  )
}
