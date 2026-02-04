import { z } from 'zod';

// ============================================================================
// Detected Stack Schema
// ============================================================================

/**
 * Detected technology stack from analyzing the repository
 */
export const DetectedStackSchema = z.object({
  framework: z.string().nullable(),
  state_management: z.string().nullable(),
  styling: z.string().nullable(),
  testing: z.string().nullable(),
});
export type DetectedStack = z.infer<typeof DetectedStackSchema>;

/**
 * Default empty detected stack
 */
export const DEFAULT_DETECTED_STACK: DetectedStack = {
  framework: null,
  state_management: null,
  styling: null,
  testing: null,
};

// ============================================================================
// Learned Pattern Schema
// ============================================================================

/**
 * A pattern learned by the agent from user feedback
 */
export const LearnedPatternSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  learned_from_task_id: z.string(),
  created_at: z.string(),
});
export type LearnedPattern = z.infer<typeof LearnedPatternSchema>;

// ============================================================================
// Repository Schema
// ============================================================================

/**
 * A repository that has been added to the dashboard
 */
export const RepositorySchema = z.object({
  id: z.string(),
  name: z.string(),                     // "ezeoli88/dash-agent"
  url: z.string(),                      // "https://github.com/..."
  default_branch: z.string(),           // "main"
  detected_stack: DetectedStackSchema,
  conventions: z.string(),              // Markdown editable
  learned_patterns: z.array(LearnedPatternSchema),
  active_tasks_count: z.number().default(0),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Repository = z.infer<typeof RepositorySchema>;

// ============================================================================
// Create Repository Schema
// ============================================================================

/**
 * Input for creating a new repository
 */
export const CreateRepositorySchema = z.object({
  name: z.string().min(1, 'Repository name is required'),
  url: z.string().url('Invalid repository URL'),
  default_branch: z.string().default('main'),
});
export type CreateRepositoryInput = z.infer<typeof CreateRepositorySchema>;

// ============================================================================
// Update Repository Schema
// ============================================================================

/**
 * Input for updating a repository
 */
export const UpdateRepositorySchema = z.object({
  default_branch: z.string().optional(),
  conventions: z.string().optional(),
});
export type UpdateRepositoryInput = z.infer<typeof UpdateRepositorySchema>;

// ============================================================================
// GitHub Repository Schema (from GitHub API)
// ============================================================================

/**
 * A repository from the user's GitHub account
 */
export const GitHubRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  html_url: z.string(),
  description: z.string().nullable(),
  default_branch: z.string(),
  private: z.boolean(),
  language: z.string().nullable(),
  updated_at: z.string(),
  stargazers_count: z.number(),
});
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;

/**
 * Response from listing GitHub repositories
 */
export const GitHubReposResponseSchema = z.object({
  repos: z.array(GitHubRepositorySchema),
  total: z.number(),
});
export type GitHubReposResponse = z.infer<typeof GitHubReposResponseSchema>;

// ============================================================================
// Stack Detection Response
// ============================================================================

/**
 * Response from detecting the tech stack of a repository
 */
export const StackDetectionResponseSchema = z.object({
  detected_stack: DetectedStackSchema,
  confidence: z.object({
    framework: z.number().min(0).max(1),
    state_management: z.number().min(0).max(1),
    styling: z.number().min(0).max(1),
    testing: z.number().min(0).max(1),
  }),
});
export type StackDetectionResponse = z.infer<typeof StackDetectionResponseSchema>;

// ============================================================================
// Clear Patterns Response
// ============================================================================

/**
 * Response from clearing learned patterns
 */
export const ClearPatternsResponseSchema = z.object({
  success: z.boolean(),
  cleared_count: z.number(),
});
export type ClearPatternsResponse = z.infer<typeof ClearPatternsResponseSchema>;

// ============================================================================
// Add Pattern Request/Response
// ============================================================================

/**
 * Request to add a learned pattern
 */
export const AddPatternRequestSchema = z.object({
  pattern: z.string().min(1, 'Pattern text is required'),
  taskId: z.string().min(1, 'Task ID is required'),
});
export type AddPatternRequest = z.infer<typeof AddPatternRequestSchema>;

/**
 * Response from adding a learned pattern
 */
export const AddPatternResponseSchema = z.object({
  success: z.boolean(),
  pattern: LearnedPatternSchema,
});
export type AddPatternResponse = z.infer<typeof AddPatternResponseSchema>;

// ============================================================================
// Delete Pattern Response
// ============================================================================

/**
 * Response from deleting a learned pattern
 */
export const DeletePatternResponseSchema = z.object({
  success: z.boolean(),
});
export type DeletePatternResponse = z.infer<typeof DeletePatternResponseSchema>;
