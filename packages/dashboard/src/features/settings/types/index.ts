/**
 * Theme options
 */
export type Theme = 'light' | 'dark' | 'system'

/**
 * Language options for generated specs
 */
export type SpecLanguage = 'es' | 'en'

/**
 * User preferences
 */
export interface UserPreferences {
  specLanguage: SpecLanguage
}

/**
 * Export data structure from backend
 */
export interface ExportData {
  version: number
  exportedAt: string
  tasks: Record<string, unknown>[]
  task_logs: Record<string, unknown>[]
  repositories: Record<string, unknown>[]
}

/**
 * Import response from backend
 */
export interface ImportResponse {
  success: boolean
  imported: {
    tasks: number
    task_logs: number
    repositories: number
  }
  merged: boolean
}

/**
 * Delete response from backend
 */
export interface DeleteResponse {
  success: boolean
  deleted: {
    tasks: number
    task_logs: number
    repositories: number
  }
}

/**
 * Language option info
 */
export interface LanguageOption {
  value: SpecLanguage
  label: string
  nativeLabel: string
}

/**
 * Available language options
 */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: 'es', label: 'Spanish', nativeLabel: 'Espanol' },
  { value: 'en', label: 'English', nativeLabel: 'English' },
]

/**
 * Theme option info
 */
export interface ThemeOption {
  value: Theme
  label: string
}

/**
 * Available theme options
 */
export const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
]
