'use client'

import { useState, useMemo } from 'react'
import { FileText, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { useRepoStore } from '@/features/repos/stores/repo-store'
import { useSpecs } from '../hooks/use-specs'
import { useSpecUIStore } from '../stores/spec-ui-store'
import { SpecTable } from './spec-table'
import { tasksApi } from '@/lib/api-client'
import { useStartTask } from '@/features/tasks/hooks/use-start-task'
import { toast } from 'sonner'
import type { TaskStatus } from '@/features/tasks/types'

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'refining', label: 'Generating' },
  { value: 'pending_approval', label: 'Ready for Review' },
] as const

type TabValue = typeof STATUS_TABS[number]['value']

export function SpecListPage() {
  const { selectedRepoId, selectedRepo } = useRepoStore()
  const { openCreate, searchQuery, setSearchQuery } = useSpecUIStore()
  const [activeTab, setActiveTab] = useState<TabValue>('all')
  const startTask = useStartTask()

  const statusFilter = useMemo(() => {
    if (activeTab === 'all') return undefined
    return [activeTab] as TaskStatus[]
  }, [activeTab])

  const { data: tasks, isLoading, error } = useSpecs({
    repository_id: selectedRepoId ?? undefined,
    search: searchQuery || undefined,
    statusFilter,
  })

  const handleGenerate = async (taskId: string) => {
    try {
      await tasksApi.start(taskId)
      toast.success('Spec generation started')
    } catch (err) {
      toast.error(`Failed to start generation: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="size-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Specifications</h1>
            {selectedRepo && (
              <p className="text-sm text-muted-foreground">{selectedRepo.name}</p>
            )}
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-2" />
          New Spec
        </Button>
      </div>

      {/* Search + Filter tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search specs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-16 text-destructive">
          <p className="text-sm font-medium">Failed to load specs</p>
          <p className="text-xs mt-1">{error.message}</p>
        </div>
      ) : (
        <SpecTable tasks={tasks ?? []} onGenerate={handleGenerate} />
      )}
    </div>
  )
}
