'use client'

import { BoardView } from '@/features/board'
import { CreateTaskDialog } from '@/features/tasks/components'

export default function BoardPage() {
  return (
    <>
      <div className="animate-in fade-in duration-300">
        <BoardView />
      </div>
      <CreateTaskDialog />
    </>
  )
}
