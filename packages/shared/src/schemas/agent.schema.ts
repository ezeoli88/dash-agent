import { z } from 'zod';

// ============================================================================
// Agent Type Schemas
// ============================================================================

/**
 * Supported CLI agent types
 */
export const AgentTypeSchema = z.enum(['claude-code', 'codex', 'gemini', 'openrouter']);
export type AgentType = z.infer<typeof AgentTypeSchema>;

/**
 * Agent types list for UI iteration
 */
export const AGENT_TYPES = ['claude-code', 'codex', 'gemini', 'openrouter'] as const;

// ============================================================================
// Agent Model Schemas
// ============================================================================

/**
 * Model available for an agent
 */
export const AgentModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});
export type AgentModel = z.infer<typeof AgentModelSchema>;

// ============================================================================
// Detected Agent Schemas
// ============================================================================

/**
 * Detected agent information from CLI detection
 */
export const DetectedAgentSchema = z.object({
  id: AgentTypeSchema,
  name: z.string(),
  installed: z.boolean(),
  version: z.string().nullable(),
  authenticated: z.boolean(),
  models: z.array(AgentModelSchema),
});
export type DetectedAgent = z.infer<typeof DetectedAgentSchema>;

/**
 * Response schema for detected agents endpoint
 */
export const DetectedAgentsResponseSchema = z.object({
  agents: z.array(DetectedAgentSchema),
});
export type DetectedAgentsResponse = z.infer<typeof DetectedAgentsResponseSchema>;
