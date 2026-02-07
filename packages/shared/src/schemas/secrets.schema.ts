import { z } from 'zod';
import { AIProviderSchema } from './setup.schema.js';

// ============================================================================
// GitHub Connection Method
// ============================================================================

/**
 * Method used to connect GitHub account
 */
export const GitHubConnectionMethodSchema = z.enum(['oauth', 'pat']);
export type GitHubConnectionMethod = z.infer<typeof GitHubConnectionMethodSchema>;

// ============================================================================
// AI Secret Schemas
// ============================================================================

/**
 * Request to save an AI API key
 */
export const SaveAISecretRequestSchema = z.object({
  provider: AIProviderSchema,
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().optional(), // For OpenRouter model selection
});
export type SaveAISecretRequest = z.infer<typeof SaveAISecretRequestSchema>;

/**
 * Response from saving an AI secret
 */
export const SaveAISecretResponseSchema = z.object({
  success: z.boolean(),
  provider: AIProviderSchema,
  modelInfo: z.object({
    name: z.string(),
    description: z.string(),
  }).optional(),
  error: z.string().optional(),
});
export type SaveAISecretResponse = z.infer<typeof SaveAISecretResponseSchema>;

/**
 * AI connection status (without exposing the key)
 */
export const AISecretStatusSchema = z.object({
  connected: z.boolean(),
  provider: AIProviderSchema.nullable(),
  model: z.string().nullable(), // For OpenRouter
  modelInfo: z.object({
    name: z.string(),
    description: z.string(),
  }).nullable(),
});
export type AISecretStatus = z.infer<typeof AISecretStatusSchema>;

// ============================================================================
// GitHub Secret Schemas
// ============================================================================

/**
 * Request to save a GitHub token (from OAuth or PAT)
 */
export const SaveGitHubSecretRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  connectionMethod: GitHubConnectionMethodSchema,
  username: z.string().optional(), // Pre-validated username from PAT flow
  avatarUrl: z.string().optional(), // Pre-validated avatar from PAT flow
});
export type SaveGitHubSecretRequest = z.infer<typeof SaveGitHubSecretRequestSchema>;

/**
 * Response from saving a GitHub secret
 */
export const SaveGitHubSecretResponseSchema = z.object({
  success: z.boolean(),
  username: z.string().optional(),
  avatarUrl: z.string().optional(),
  error: z.string().optional(),
});
export type SaveGitHubSecretResponse = z.infer<typeof SaveGitHubSecretResponseSchema>;

/**
 * GitHub connection status (without exposing the token)
 */
export const GitHubSecretStatusSchema = z.object({
  connected: z.boolean(),
  username: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  connectionMethod: GitHubConnectionMethodSchema.nullable(),
});
export type GitHubSecretStatus = z.infer<typeof GitHubSecretStatusSchema>;

/**
 * Request to validate a GitHub Personal Access Token
 */
export const ValidateGitHubPATRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});
export type ValidateGitHubPATRequest = z.infer<typeof ValidateGitHubPATRequestSchema>;

/**
 * Response from validating a GitHub PAT
 */
export const ValidateGitHubPATResponseSchema = z.object({
  valid: z.boolean(),
  username: z.string().optional(),
  avatarUrl: z.string().optional(),
  scopes: z.array(z.string()).optional(), // Available scopes
  error: z.string().optional(),
});
export type ValidateGitHubPATResponse = z.infer<typeof ValidateGitHubPATResponseSchema>;

// ============================================================================
// Combined Status Schemas
// ============================================================================

/**
 * Combined status of all secrets/connections
 */
export const AllSecretsStatusSchema = z.object({
  ai: AISecretStatusSchema,
  github: GitHubSecretStatusSchema,
  isComplete: z.boolean(), // True if AI is connected (GitHub is optional)
});
export type AllSecretsStatus = z.infer<typeof AllSecretsStatusSchema>;

/**
 * Generic delete response
 */
export const DeleteSecretResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});
export type DeleteSecretResponse = z.infer<typeof DeleteSecretResponseSchema>;
