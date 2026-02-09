'use client'

import { create } from 'zustand'
import type { Repository } from '../types'

/**
 * Repo store state interface
 */
interface RepoState {
  // Selected repository
  selectedRepoId: string | null
  selectedRepo: Repository | null

  // UI state
  isAddDialogOpen: boolean
  isConfigDialogOpen: boolean
  configRepoId: string | null

  // Actions
  setSelectedRepo: (repo: Repository | null) => void
  setSelectedRepoId: (id: string | null) => void
  openAddDialog: () => void
  closeAddDialog: () => void
  openConfigDialog: (repoId: string) => void
  closeConfigDialog: () => void
  reset: () => void
}

export const useRepoStore = create<RepoState>((set) => ({
  // Initial state
  selectedRepoId: null,
  selectedRepo: null,
  isAddDialogOpen: false,
  isConfigDialogOpen: false,
  configRepoId: null,

  // Actions
  setSelectedRepo: (repo) => set({
    selectedRepo: repo,
    selectedRepoId: repo?.id ?? null,
  }),

  setSelectedRepoId: (id) => set({
    selectedRepoId: id,
    selectedRepo: null, // Will be populated by the component
  }),

  openAddDialog: () => set({ isAddDialogOpen: true }),

  closeAddDialog: () => set({ isAddDialogOpen: false }),

  openConfigDialog: (repoId) => set({
    isConfigDialogOpen: true,
    configRepoId: repoId,
  }),

  closeConfigDialog: () => set({
    isConfigDialogOpen: false,
    configRepoId: null,
  }),

  reset: () => set({
    selectedRepoId: null,
    selectedRepo: null,
    isAddDialogOpen: false,
    isConfigDialogOpen: false,
    configRepoId: null,
  }),
}))
