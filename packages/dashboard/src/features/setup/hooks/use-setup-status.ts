'use client'

import { useSetupStore } from '../stores/setup-store'
import type { AIProvider } from '../types'

/**
 * Hook to check if setup is complete.
 *
 * Note: This now uses the new store shape that doesn't store credentials,
 * only connection status.
 */
export function useSetupStatus() {
  const aiProvider = useSetupStore((state) => state.aiProvider)
  const aiConnected = useSetupStore((state) => state.aiConnected)
  const githubConnected = useSetupStore((state) => state.githubConnected)
  const githubUsername = useSetupStore((state) => state.githubUsername)
  const githubAvatarUrl = useSetupStore((state) => state.githubAvatarUrl)
  const isSetupComplete = useSetupStore((state) => state.isSetupComplete)

  return {
    isComplete: isSetupComplete(),
    hasAIProvider: aiConnected && aiProvider !== null,
    hasGitHub: githubConnected,
    aiProvider: aiProvider as AIProvider | null,
    githubUsername,
    githubAvatarUrl,
  }
}

/**
 * Hook to get current setup step
 */
export function useCurrentSetupStep(): 'ai-provider' | 'github' | 'complete' {
  const { hasAIProvider, hasGitHub } = useSetupStatus()

  if (!hasAIProvider) return 'ai-provider'
  if (!hasGitHub) return 'github'
  return 'complete'
}
