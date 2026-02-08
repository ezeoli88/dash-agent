'use client'

import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ValidateGitLabPATRequest, ValidateGitLabPATResponse } from '@dash-agent/shared'

/**
 * Hook for validating a GitLab Personal Access Token.
 */
export function useValidateGitLabPAT() {
  return useMutation({
    mutationFn: (data: ValidateGitLabPATRequest) =>
      apiClient.post<ValidateGitLabPATResponse>('/secrets/gitlab/validate-pat', data),
  })
}
