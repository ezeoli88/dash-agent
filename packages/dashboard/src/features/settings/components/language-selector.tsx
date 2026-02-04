'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePreferencesStore } from '../stores/preferences-store'
import { LANGUAGE_OPTIONS, type SpecLanguage } from '../types'

/**
 * Language selector component for generated specs
 */
export function LanguageSelector() {
  const specLanguage = usePreferencesStore((state) => state.preferences.specLanguage)
  const setSpecLanguage = usePreferencesStore((state) => state.setSpecLanguage)

  return (
    <div className="space-y-3">
      <Label htmlFor="spec-language" className="text-sm font-medium">
        Idioma de specs
      </Label>
      <Select
        value={specLanguage}
        onValueChange={(value) => setSpecLanguage(value as SpecLanguage)}
      >
        <SelectTrigger id="spec-language" className="w-full">
          <SelectValue placeholder="Seleccionar idioma" />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.nativeLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        El idioma en que el PM Agent generara las especificaciones de tareas.
      </p>
    </div>
  )
}
