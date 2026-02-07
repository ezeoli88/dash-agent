import type { Metadata } from 'next'
import { MainLayout } from '@/components/layout'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Configure connections, preferences, and application data for Agent Board.',
  openGraph: {
    title: 'Settings | Agent Board',
    description: 'Configure connections, preferences, and application data',
  },
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MainLayout>{children}</MainLayout>
}
