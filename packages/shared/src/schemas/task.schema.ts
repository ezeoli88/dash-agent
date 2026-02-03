import { z } from 'zod';

/**
 * Valid task statuses representing the lifecycle of a task.
 *
 * Flow:
 * backlog -> planning -> in_progress -> awaiting_review -> approved -> pr_created
 *                                                                          |
 *                          +-----------------------------------------------+
 *                          |
 *                          v
 *                   changes_requested  <-- POST /tasks/:id/request-changes
 *                          |                    (with reviewer feedback)
 *                          v
 *                    in_progress (agent works in same worktree)
 *                          |
 *                          v
 *                   awaiting_review
 *                          |
 *                          v
 *                    push (PR updates automatically)
 *                          |
 *                          v
 *                        done  <-- when PR is merged
 */
export const TASK_STATUSES = [
  'backlog',
  'planning',
  'in_progress',
  'awaiting_review',
  'approved',
  'pr_created',
  'changes_requested',
  'done',
  'failed',
] as const;

/**
 * Zod schema for task status validation
 */
export const TaskStatusSchema = z.enum(TASK_STATUSES);

/**
 * Task status type inferred from the schema
 */
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Complete Task entity schema
 */
export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  repo_url: z.string().url(),
  target_branch: z.string().default('main'),
  context_files: z.array(z.string()).default([]),
  build_command: z.string().nullable(),
  status: TaskStatusSchema,
  pr_url: z.string().url().nullable(),
  error: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

/**
 * Task type inferred from the schema
 */
export type Task = z.infer<typeof TaskSchema>;

/**
 * Schema for creating a new task.
 */
export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  repo_url: z
    .string()
    .url('Must be a valid URL')
    .regex(/github\.com/, 'Must be a GitHub URL'),
  target_branch: z.string().optional().default('main'),
  context_files: z.array(z.string()).optional().default([]),
  build_command: z.string().optional(),
});

/**
 * Input type for creating a task
 */
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

/**
 * Schema for updating an existing task.
 */
export const UpdateTaskSchema = z.object({
  title: z.string().min(1, 'Title must be non-empty').optional(),
  description: z.string().min(1, 'Description must be non-empty').optional(),
  repo_url: z.string().url('Repository URL must be a valid URL').optional(),
  target_branch: z.string().optional(),
  context_files: z.array(z.string()).optional(),
  build_command: z.string().nullable().optional(),
  status: TaskStatusSchema.optional(),
  pr_url: z.string().url().nullable().optional(),
  error: z.string().nullable().optional(),
});

/**
 * Input type for updating a task
 */
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
