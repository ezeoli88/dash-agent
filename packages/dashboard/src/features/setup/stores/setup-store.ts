'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIProvider, OpenRouterModel, GitHubConnectionMethod } from '@dash-agent/shared'

/**
 * Validation state for API key input
 */
export type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid'

/**
 * GitHub connection state
 */
export type GitHubConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

/**
 * Setup store state interface.
 *
 * IMPORTANT: This store NO LONGER stores API keys or tokens.
 * Credentials are stored server-side with AES-256 encryption.
 * This store only tracks CONNECTION STATE for UI purposes.
 */
interface SetupState {
  // AI Connection State (no key stored)
  aiProvider: AIProvider | null
  aiConnected: boolean
  aiModel: string | null // For OpenRouter model selection
  aiModelInfo: { name: string; description: string } | null

  // GitHub Connection State (no token stored)
  githubConnected: boolean
  githubUsername: string | null
  githubAvatarUrl: string | null
  githubConnectionMethod: GitHubConnectionMethod | null

  // UI state
  validationState: ValidationState
  validationError: string | null
  githubConnectionState: GitHubConnectionState
  githubError: string | null

  // OpenRouter specific state (for model selection UI)
  availableModels: OpenRouterModel[]

  // Actions - Sync with server state
  syncFromServer: (serverState: {
    ai: {
      connected: boolean
      provider: AIProvider | null
      model: string | null
      modelInfo: { name: string; description: string } | null
    }
    github: {
      connected: boolean
      username: string | null
      avatarUrl: string | null
      connectionMethod: GitHubConnectionMethod | null
    }
  }) => void

  // Actions - Update local state after successful server operations
  setAIConnected: (provider: AIProvider, modelInfo?: { name: string; description: string }, model?: string) => void
  clearAI: () => void
  setGitHubConnected: (username: string, avatarUrl: string | null, connectionMethod: GitHubConnectionMethod) => void
  clearGitHub: () => void

  // UI state actions
  setValidationState: (state: ValidationState, error?: string | null) => void
  setGitHubConnectionState: (state: GitHubConnectionState, error?: string | null) => void
  setAvailableModels: (models: OpenRouterModel[]) => void

  // Computed
  isSetupComplete: () => boolean

  // Reset
  resetSetup: () => void
}

/**
 * Default state
 */
const DEFAULT_STATE = {
  // AI
  aiProvider: null as AIProvider | null,
  aiConnected: false,
  aiModel: null as string | null,
  aiModelInfo: null as { name: string; description: string } | null,

  // GitHub
  githubConnected: false,
  githubUsername: null as string | null,
  githubAvatarUrl: null as string | null,
  githubConnectionMethod: null as GitHubConnectionMethod | null,

  // UI
  validationState: 'idle' as ValidationState,
  validationError: null as string | null,
  githubConnectionState: 'disconnected' as GitHubConnectionState,
  githubError: null as string | null,
  availableModels: [] as OpenRouterModel[],
}

/**
 * Persisted state shape - only persist connection status, NOT credentials
 */
interface PersistedState {
  aiProvider: AIProvider | null
  aiConnected: boolean
  aiModel: string | null
  aiModelInfo: { name: string; description: string } | null
  githubConnected: boolean
  githubUsername: string | null
  githubAvatarUrl: string | null
  githubConnectionMethod: GitHubConnectionMethod | null
}

export const useSetupStore = create<SetupState>()(
  persist(
    (set, get) => ({
      // Initial state
      ...DEFAULT_STATE,

      // Sync with server state (called on app load)
      syncFromServer: (serverState) => set({
        aiProvider: serverState.ai.provider,
        aiConnected: serverState.ai.connected,
        aiModel: serverState.ai.model,
        aiModelInfo: serverState.ai.modelInfo,
        githubConnected: serverState.github.connected,
        githubUsername: serverState.github.username,
        githubAvatarUrl: serverState.github.avatarUrl,
        githubConnectionMethod: serverState.github.connectionMethod,
        // Update connection states based on server
        githubConnectionState: serverState.github.connected ? 'connected' : 'disconnected',
        validationState: serverState.ai.connected ? 'valid' : 'idle',
      }),

      // Set AI connected after successful server save
      setAIConnected: (provider, modelInfo, model) => set({
        aiProvider: provider,
        aiConnected: true,
        aiModel: model ?? null,
        aiModelInfo: modelInfo ?? null,
        validationState: 'valid',
        validationError: null,
      }),

      // Clear AI connection
      clearAI: () => set({
        aiProvider: null,
        aiConnected: false,
        aiModel: null,
        aiModelInfo: null,
        availableModels: [],
        validationState: 'idle',
        validationError: null,
      }),

      // Set GitHub connected after successful server save
      setGitHubConnected: (username, avatarUrl, connectionMethod) => set({
        githubConnected: true,
        githubUsername: username,
        githubAvatarUrl: avatarUrl,
        githubConnectionMethod: connectionMethod,
        githubConnectionState: 'connected',
        githubError: null,
      }),

      // Clear GitHub connection
      clearGitHub: () => set({
        githubConnected: false,
        githubUsername: null,
        githubAvatarUrl: null,
        githubConnectionMethod: null,
        githubConnectionState: 'disconnected',
        githubError: null,
      }),

      // UI state actions
      setValidationState: (validationState, error = null) => set({
        validationState,
        validationError: error,
      }),

      setGitHubConnectionState: (githubConnectionState, error = null) => set({
        githubConnectionState,
        githubError: error,
      }),

      setAvailableModels: (models) => set({ availableModels: models }),

      // Computed
      isSetupComplete: () => {
        const state = get()
        return state.aiConnected && state.githubConnected
      },

      // Reset
      resetSetup: () => set(DEFAULT_STATE),
    }),
    {
      name: 'dash-agent-setup-v2', // New storage key to avoid conflicts with old format
      // Only persist connection state, not UI state
      partialize: (state): PersistedState => ({
        aiProvider: state.aiProvider,
        aiConnected: state.aiConnected,
        aiModel: state.aiModel,
        aiModelInfo: state.aiModelInfo,
        githubConnected: state.githubConnected,
        githubUsername: state.githubUsername,
        githubAvatarUrl: state.githubAvatarUrl,
        githubConnectionMethod: state.githubConnectionMethod,
      }),
    }
  )
)

// =============================================================================
// Backward Compatibility: Export types that components might expect
// =============================================================================

/**
 * @deprecated Use the new setup store state directly
 */
export interface SetupConfig {
  aiProvider: AIProvider | null
  aiApiKey: null // Always null - keys stored server-side
  openRouterModel: string | null
  githubConnected: boolean
  githubUsername: string | null
  githubAvatarUrl: string | null
  githubToken: null // Always null - tokens stored server-side
}

/**
 * Helper to get a "config" object for backward compatibility with components
 * that expect the old format.
 *
 * @deprecated Components should use useSetupStore selectors directly
 */
export function useSetupConfig(): SetupConfig {
  const store = useSetupStore()
  return {
    aiProvider: store.aiProvider,
    aiApiKey: null,
    openRouterModel: store.aiModel,
    githubConnected: store.githubConnected,
    githubUsername: store.githubUsername,
    githubAvatarUrl: store.githubAvatarUrl,
    githubToken: null,
  }
}
