"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Theme options
 */
export type Theme = "light" | "dark" | "system";

/**
 * User preferences interface
 */
export interface UserPreferences {
  theme: Theme;
}

/**
 * Default preferences
 */
const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
};

/**
 * Preferences store state interface
 */
interface PreferencesState {
  // Preferences data
  preferences: UserPreferences;

  // Actions
  setTheme: (theme: Theme) => void;

  // Reset
  resetPreferences: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      // Initial state
      preferences: DEFAULT_PREFERENCES,

      // Actions
      setTheme: (theme) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            theme,
          },
        })),

      // Reset
      resetPreferences: () =>
        set({
          preferences: DEFAULT_PREFERENCES,
        }),
    }),
    {
      name: "dash-agent-preferences",
    },
  ),
);
