import type { Metadata } from 'next'
import { MainLayout } from '@/components/layout'

export const metadata: Metadata = {
  title: 'Tasks',
  description: 'View and manage all AI agent tasks. Track progress, review changes, and approve completed work.',
  openGraph: {
    title: 'Tasks | Agent Board',
    description: 'View and manage all AI agent tasks',
  },
}

export default function TasksLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MainLayout>{children}</MainLayout>
}
