'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeSelector } from './theme-selector'
import { LanguageSelector } from './language-selector'

/**
 * Preferences section with theme and language settings
 */
export function PreferencesSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Preferencias</CardTitle>
        <CardDescription>
          Personaliza la apariencia y comportamiento de la aplicacion
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ThemeSelector />
        <LanguageSelector />
      </CardContent>
    </Card>
  )
}
