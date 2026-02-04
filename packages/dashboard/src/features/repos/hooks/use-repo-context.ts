'use client'

import { useEffect } from 'react'
import { useRepoStore } from '../stores/repo-store'
import { useRepos } from './use-repos'
import { useRepo } from './use-repo'

/**
 * Hook to manage the currently selected repository context
 * Syncs the selected repo from the store with the fetched data
 */
export function useRepoContext() {
  const { selectedRepoId, selectedRepo, setSelectedRepo } = useRepoStore()
  const { data: repos, isLoading: isLoadingRepos } = useRepos()
  const { data: repoDetail, isLoading: isLoadingDetail } = useRepo(selectedRepoId)

  // Sync selected repo when data changes
  useEffect(() => {
    if (selectedRepoId && repoDetail) {
      setSelectedRepo(repoDetail)
    } else if (selectedRepoId && repos) {
      // Fall back to list data if detail hasn't loaded yet
      const repo = repos.find((r) => r.id === selectedRepoId)
      if (repo) {
        setSelectedRepo(repo)
      }
    }
  }, [selectedRepoId, repoDetail, repos, setSelectedRepo])

  // Auto-select first repo if none selected and repos are loaded
  useEffect(() => {
    if (!selectedRepoId && repos && repos.length > 0 && repos[0]) {
      setSelectedRepo(repos[0])
    }
  }, [selectedRepoId, repos, setSelectedRepo])

  return {
    selectedRepo,
    selectedRepoId,
    repos: repos ?? [],
    isLoading: isLoadingRepos || isLoadingDetail,
    hasRepos: (repos?.length ?? 0) > 0,
  }
}
