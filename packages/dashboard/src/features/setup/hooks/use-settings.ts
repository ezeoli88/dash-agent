'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

interface SettingsResponse {
  default_agent_type: string | null
  default_agent_model: string | null
}

interface UpdateSettingsInput {
  default_agent_type?: string | null
  default_agent_model?: string | null
}

interface UpdateSettingsResponse {
  success: boolean
  settings: SettingsResponse
}

/**
 * Hook to fetch current application settings.
 */
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.get<SettingsResponse>('/setup/settings'),
  })
}

/**
 * Hook to update application settings.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateSettingsInput) =>
      apiClient.patch<UpdateSettingsResponse>('/setup/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}
