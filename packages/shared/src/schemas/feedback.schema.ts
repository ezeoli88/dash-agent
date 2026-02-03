import { z } from 'zod';

/**
 * Schema for sending feedback to the agent during task execution.
 */
export const FeedbackSchema = z.object({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(2000, 'Message too long'),
});

/**
 * Input type for feedback
 */
export type FeedbackInput = z.infer<typeof FeedbackSchema>;

/**
 * Schema for requesting changes on a PR.
 * Used when a reviewer wants to request modifications to the agent's work.
 */
export const RequestChangesSchema = z.object({
  feedback: z.string().min(1, 'Feedback is required'),
});

/**
 * Input type for request changes
 */
export type RequestChangesInput = z.infer<typeof RequestChangesSchema>;
