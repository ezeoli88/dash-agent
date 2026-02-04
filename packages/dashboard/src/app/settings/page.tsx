'use client'

import { ConnectionsSection, PreferencesSection, DataSection } from '@/features/settings'

export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page header */}
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Configura las conexiones, preferencias y datos de la aplicacion
        </p>
      </header>

      {/* Settings sections */}
      <div className="space-y-6 max-w-2xl">
        <ConnectionsSection />
        <PreferencesSection />
        <DataSection />
      </div>
    </div>
  )
}
