'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TaskList, TaskFilters } from '@/features/tasks/components'

export default function TasksPage() {
  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-300">
      {/* Page header */}
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Tasks</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Manage and monitor AI agent tasks
        </p>
      </header>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3 px-4 md:px-6">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="px-4 md:px-6">
          <TaskFilters />
        </CardContent>
      </Card>

      {/* Task list */}
      <Card>
        <CardContent className="pt-4 md:pt-6 px-4 md:px-6">
          <TaskList />
        </CardContent>
      </Card>
    </div>
  )
}
