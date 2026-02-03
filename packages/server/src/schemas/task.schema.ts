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

export const TaskStatusSchema = z.enum(TASK_STATUSES);

/**
 * Schema for creating a new task.
 */
export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  repo_url: z.string().url('Repository URL must be a valid URL'),
  target_branch: z.string().optional().default('main'),
  context_files: z.array(z.string()).optional().default([]),
  build_command: z.string().optional(),
});

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

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
