'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface LayoutState {
  isSidebarCollapsed: boolean
  isMobileNavOpen: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setMobileNavOpen: (open: boolean) => void
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      isMobileNavOpen: false,
      toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
      setMobileNavOpen: (open) => set({ isMobileNavOpen: open }),
    }),
    {
      name: 'layout-storage',
      partialize: (state) => ({ isSidebarCollapsed: state.isSidebarCollapsed }),
    }
  )
)
