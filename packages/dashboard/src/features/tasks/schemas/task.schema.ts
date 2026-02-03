import { z } from 'zod'

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  repo_url: z.string().url('Must be a valid URL').regex(/github\.com/, 'Must be a GitHub URL'),
  target_branch: z.string(),
  context_files: z.array(z.string()),
  build_command: z.string().optional(),
})

export type CreateTaskFormData = z.infer<typeof createTaskSchema>
