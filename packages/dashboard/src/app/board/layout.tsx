import type { Metadata } from 'next'
import { MainLayout } from '@/components/layout'

export const metadata: Metadata = {
  title: 'Board',
  description: 'Kanban board view for managing AI agent tasks. Drag and drop tasks between status columns.',
  openGraph: {
    title: 'Board | Agent Board',
    description: 'Kanban board view for managing AI agent tasks',
  },
}

export default function BoardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MainLayout>{children}</MainLayout>
}
