import { z } from 'zod';

/**
 * Schema for file change status
 */
export const FileChangeStatusSchema = z.enum(['added', 'modified', 'deleted']);

/**
 * File change status type
 */
export type FileChangeStatus = z.infer<typeof FileChangeStatusSchema>;

/**
 * Schema for a single file change
 */
export const FileChangeSchema = z.object({
  path: z.string(),
  status: FileChangeStatusSchema,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  oldContent: z.string().optional(),
  newContent: z.string().optional(),
});

/**
 * File change type
 */
export type FileChange = z.infer<typeof FileChangeSchema>;

/**
 * Schema for changes summary
 */
export const ChangesSummarySchema = z.object({
  totalAdditions: z.number().int().nonnegative(),
  totalDeletions: z.number().int().nonnegative(),
  filesChanged: z.number().int().nonnegative(),
});

/**
 * Changes summary type
 */
export type ChangesSummary = z.infer<typeof ChangesSummarySchema>;

/**
 * Schema for task changes response
 */
export const TaskChangesResponseSchema = z.object({
  files: z.array(FileChangeSchema),
  diff: z.string(),
  summary: ChangesSummarySchema.optional(),
});

/**
 * Task changes response type
 */
export type TaskChangesResponse = z.infer<typeof TaskChangesResponseSchema>;

/**
 * Schema for API error details
 */
export const ApiErrorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
});

/**
 * Schema for standard API error response
 */
export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.array(ApiErrorDetailSchema).optional(),
  code: z.string().optional(),
});

/**
 * API error type
 */
export type ApiError = z.infer<typeof ApiErrorSchema>;
