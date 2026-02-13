'use client'

import { useEffect } from 'react'
import { useRepoStore } from '../stores/repo-store'
import { useRepos } from './use-repos'
import { useRepo } from './use-repo'

/**
 * Hook to manage the currently selected repository context.
 *
 * The repo selection lives ONLY in Zustand (in-memory, not persisted).
 * The only place a repo gets selected is the /repos page via handleContinue
 * or the sidebar RepoList. No auto-select — if nothing is selected,
 * MainLayout redirects to /repos.
 */
export function useRepoContext() {
  const { selectedRepoId, selectedRepo, setSelectedRepo } = useRepoStore()
  const { data: repos, isLoading: isLoadingRepos } = useRepos()
  const { data: repoDetail, isLoading: isLoadingDetail } = useRepo(selectedRepoId)

  // Sync selected repo detail from server (keeps local object fresh)
  useEffect(() => {
    if (selectedRepoId && repoDetail) {
      setSelectedRepo(repoDetail)
    }
  }, [selectedRepoId, repoDetail, setSelectedRepo])

  return {
    selectedRepo,
    selectedRepoId,
    repos: repos ?? [],
    isLoading: isLoadingRepos || isLoadingDetail,
    hasRepos: (repos?.length ?? 0) > 0,
  }
}
