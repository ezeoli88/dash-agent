'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeSelector } from './theme-selector'

/**
 * Preferences section with theme settings
 */
export function PreferencesSection({ id }: { id?: string }) {
  return (
    <Card id={id}>
      <CardHeader>
        <CardTitle className="text-lg">Preferencias</CardTitle>
        <CardDescription>
          Personaliza la apariencia de la aplicacion
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ThemeSelector />
      </CardContent>
    </Card>
  )
}
