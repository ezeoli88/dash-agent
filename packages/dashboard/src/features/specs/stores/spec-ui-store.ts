'use client'

import { create } from 'zustand'
import type { TaskStatus } from '@/features/tasks/types'

type SpecPhaseStatus = Extract<TaskStatus, 'draft' | 'refining' | 'pending_approval'>

interface SpecUIState {
  // Create dialog state
  isCreateOpen: boolean
  openCreate: () => void
  closeCreate: () => void

  // Detail drawer state
  selectedSpecId: string | null
  openDetail: (id: string) => void
  closeDetail: () => void

  // Search and filter state
  searchQuery: string
  setSearchQuery: (query: string) => void
  statusFilter: SpecPhaseStatus[] | null
  setStatusFilter: (statuses: SpecPhaseStatus[] | null) => void
}

export const useSpecUIStore = create<SpecUIState>()((set) => ({
  // Create dialog
  isCreateOpen: false,
  openCreate: () => set({ isCreateOpen: true }),
  closeCreate: () => set({ isCreateOpen: false }),

  // Detail drawer
  selectedSpecId: null,
  openDetail: (id) => set({ selectedSpecId: id }),
  closeDetail: () => set({ selectedSpecId: null }),

  // Search and filter
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  statusFilter: null,
  setStatusFilter: (statuses) => set({ statusFilter: statuses }),
}))
