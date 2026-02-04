'use client'

import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ValidateGitHubPATRequest, ValidateGitHubPATResponse } from '@dash-agent/shared'

/**
 * Hook for validating a GitHub Personal Access Token.
 * This is used to preview the user info before saving the token.
 */
export function useValidateGitHubPAT() {
  return useMutation({
    mutationFn: (data: ValidateGitHubPATRequest) =>
      apiClient.post<ValidateGitHubPATResponse>('/secrets/github/validate-pat', data),
  })
}
