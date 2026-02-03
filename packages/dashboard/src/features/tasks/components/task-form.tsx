'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { TagInput } from '@/components/shared/tag-input'
import { createTaskSchema, type CreateTaskFormData } from '../schemas/task.schema'

interface TaskFormProps {
  onSubmit: (data: CreateTaskFormData) => void
  onCancel?: () => void
  isSubmitting?: boolean
}

interface FormFieldProps {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
  description?: string
}

function FormField({ label, required, error, children, description }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {children}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}

export function TaskForm({ onSubmit, onCancel, isSubmitting = false }: TaskFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateTaskFormData>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: '',
      description: '',
      repo_url: '',
      target_branch: 'main',
      context_files: [],
      build_command: '',
    },
  })

  const contextFiles = watch('context_files')

  const handleFormSubmit = handleSubmit((data) => {
    // Clean up the data - remove empty strings
    const cleanedData = {
      ...data,
      build_command: data.build_command?.trim() || undefined,
      context_files: data.context_files.filter(Boolean),
    }
    onSubmit(cleanedData)
  })

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6">
      {/* Title */}
      <FormField
        label="Title"
        required
        error={errors.title?.message}
      >
        <Input
          {...register('title')}
          placeholder="e.g., Implement user authentication"
          aria-invalid={!!errors.title}
          disabled={isSubmitting}
        />
      </FormField>

      {/* Description */}
      <FormField
        label="Description"
        required
        error={errors.description?.message}
        description="Provide details about what needs to be done"
      >
        <Textarea
          {...register('description')}
          placeholder="Describe the task in detail. Include acceptance criteria, edge cases, and any relevant context..."
          rows={4}
          aria-invalid={!!errors.description}
          disabled={isSubmitting}
          className="resize-none"
        />
      </FormField>

      {/* Repository URL */}
      <FormField
        label="Repository URL"
        required
        error={errors.repo_url?.message}
      >
        <Input
          {...register('repo_url')}
          placeholder="https://github.com/owner/repo"
          type="url"
          aria-invalid={!!errors.repo_url}
          disabled={isSubmitting}
        />
      </FormField>

      {/* Target Branch */}
      <FormField
        label="Target Branch"
        error={errors.target_branch?.message}
      >
        <Input
          {...register('target_branch')}
          placeholder="main"
          disabled={isSubmitting}
        />
      </FormField>

      {/* Context Files */}
      <FormField
        label="Context Files"
        error={errors.context_files?.message}
        description="Paths to relevant files or directories (press Enter or comma to add)"
      >
        <TagInput
          value={contextFiles}
          onChange={(value) => setValue('context_files', value)}
          placeholder="e.g., src/components/auth/"
          disabled={isSubmitting}
        />
      </FormField>

      {/* Build Command */}
      <FormField
        label="Build Command"
        error={errors.build_command?.message}
        description="Command to run for building/testing the project"
      >
        <Input
          {...register('build_command')}
          placeholder="npm run build"
          disabled={isSubmitting}
        />
      </FormField>

      {/* Actions */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-4">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Creating...
            </>
          ) : (
            'Create Task'
          )}
        </Button>
      </div>
    </form>
  )
}
