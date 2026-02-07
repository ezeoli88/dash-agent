'use client'

import { HelpCircle } from 'lucide-react'
import { ConnectionsSection, PreferencesSection, DataSection, SettingsTour } from '@/features/settings'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  const handleLaunchTour = () => {
    window.dispatchEvent(new Event('settings-tour-launch'))
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page header */}
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Configura las conexiones, preferencias y datos de la aplicacion
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLaunchTour}
          title="Tour de Settings"
        >
          <HelpCircle className="size-5" />
        </Button>
      </header>

      {/* Settings sections */}
      <div className="space-y-6 max-w-2xl">
        <ConnectionsSection id="settings-connections" />
        <PreferencesSection id="settings-preferences" />
        <DataSection id="settings-data" />
      </div>

      {/* Interactive tour */}
      <SettingsTour />
    </div>
  )
}
