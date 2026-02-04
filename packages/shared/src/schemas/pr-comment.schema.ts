import { z } from 'zod';

/**
 * PR Comment author schema
 */
export const PRCommentAuthorSchema = z.object({
  login: z.string(),
  avatarUrl: z.string().url().optional(),
});

/**
 * PR Comment author type
 */
export type PRCommentAuthor = z.infer<typeof PRCommentAuthorSchema>;

/**
 * PR Comment schema - represents a comment on a GitHub PR
 */
export const PRCommentSchema = z.object({
  /** Unique comment ID from GitHub */
  id: z.number(),
  /** Comment body/content (markdown) */
  body: z.string(),
  /** Comment author information */
  author: PRCommentAuthorSchema,
  /** ISO timestamp when the comment was created */
  createdAt: z.string().datetime(),
  /** ISO timestamp when the comment was last updated */
  updatedAt: z.string().datetime(),
  /** Direct URL to the comment on GitHub */
  url: z.string().url(),
  /** Whether this is a review comment (on specific code) vs issue comment */
  isReviewComment: z.boolean(),
  /** For review comments: the file path */
  path: z.string().optional(),
  /** For review comments: the line number */
  line: z.number().optional(),
});

/**
 * PR Comment type
 */
export type PRComment = z.infer<typeof PRCommentSchema>;

/**
 * PR Comments response schema - returned by the API
 */
export const PRCommentsResponseSchema = z.object({
  comments: z.array(PRCommentSchema),
  totalCount: z.number(),
});

/**
 * PR Comments response type
 */
export type PRCommentsResponse = z.infer<typeof PRCommentsResponseSchema>;
