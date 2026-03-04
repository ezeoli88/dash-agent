'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface SpecEditorProps {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  className?: string
}

export function SpecEditor({ value, onChange, readOnly = false, className }: SpecEditorProps) {
  const [activeTab, setActiveTab] = useState(readOnly ? 'preview' : 'edit')

  if (readOnly) {
    return (
      <div className={cn('overflow-auto', className)}>
        <div className="prose prose-sm dark:prose-invert max-w-none p-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value || '*No content*'}</ReactMarkdown>
        </div>
      </div>
    )
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className={cn('flex flex-col h-full', className)}>
      <TabsList variant="line" className="px-4 shrink-0">
        <TabsTrigger value="edit">Edit</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>

      <TabsContent value="edit" className="flex-1 overflow-hidden mt-0">
        <Textarea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="h-full min-h-0 resize-none rounded-none border-0 font-mono text-sm focus-visible:ring-0 focus-visible:border-0"
          placeholder="Write your spec in markdown..."
        />
      </TabsContent>

      <TabsContent value="preview" className="flex-1 overflow-auto mt-0">
        <div className="prose prose-sm dark:prose-invert max-w-none p-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value || '*No content*'}</ReactMarkdown>
        </div>
      </TabsContent>
    </Tabs>
  )
}
