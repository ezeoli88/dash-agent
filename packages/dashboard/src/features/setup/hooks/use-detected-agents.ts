'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { DetectedAgent } from '@dash-agent/shared'

interface DetectedAgentsResponse {
  agents: DetectedAgent[]
}

/**
 * Hook to fetch detected CLI agents from the server.
 * Results are cached for 5 minutes (matching server-side cache).
 */
export function useDetectedAgents() {
  return useQuery({
    queryKey: ['detected-agents'],
    queryFn: () => apiClient.get<DetectedAgentsResponse>('/setup/agents'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (data) => data.agents,
  })
}
