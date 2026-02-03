import type { Metadata } from 'next'

interface Props {
  params: Promise<{ taskId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { taskId } = await params

  return {
    title: `Task ${taskId}`,
    description: 'Task details, execution logs, and file changes',
    openGraph: {
      title: `Task ${taskId} | Agent Board`,
      description: 'View task details, execution logs, and file changes',
    },
  }
}

export default function TaskDetailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
