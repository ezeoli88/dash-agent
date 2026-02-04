'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SpecLanguage, UserPreferences } from '../types'

/**
 * Preferences store state interface
 */
interface PreferencesState {
  // Preferences data
  preferences: UserPreferences

  // Actions
  setSpecLanguage: (language: SpecLanguage) => void

  // Reset
  resetPreferences: () => void
}

/**
 * Default preferences
 */
const DEFAULT_PREFERENCES: UserPreferences = {
  specLanguage: 'es',
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      // Initial state
      preferences: DEFAULT_PREFERENCES,

      // Actions
      setSpecLanguage: (language) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            specLanguage: language,
          },
        })),

      // Reset
      resetPreferences: () =>
        set({
          preferences: DEFAULT_PREFERENCES,
        }),
    }),
    {
      name: 'dash-agent-preferences',
    }
  )
)
