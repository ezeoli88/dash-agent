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
