import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface McpConfigResponse {
  url: string
  port: number
}

export function useMcpConfig() {
  return useQuery({
    queryKey: ['setup', 'mcp-config'],
    queryFn: () => apiClient.get<McpConfigResponse>('/setup/mcp-config'),
  })
}
