/**
 * Theme options
 */
export type Theme = "light" | "dark" | "system";

/**
 * Theme option info
 */
export interface ThemeOption {
  value: Theme;
  label: string;
}

/**
 * Available theme options
 */
export const THEME_OPTIONS: ThemeOption[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];
