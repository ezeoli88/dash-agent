import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Configuracion',
  description: 'Configura tu dash-agent para empezar a usarlo',
}

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
