'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface ConventionsEditorProps {
  value: string
  onSave: (value: string) => Promise<void>
  isSaving?: boolean
  className?: string
}

export function ConventionsEditor({
  value,
  onSave,
  isSaving = false,
  className,
}: ConventionsEditorProps) {
  const [content, setContent] = useState(value)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    setContent(value)
    setHasChanges(false)
  }, [value])

  const handleChange = (newContent: string) => {
    setContent(newContent)
    setHasChanges(newContent !== value)
  }

  const handleSave = async () => {
    if (!hasChanges || isSaving) return
    await onSave(content)
    setHasChanges(false)
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Convenciones</label>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Guardar
        </Button>
      </div>
      <Textarea
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="## Estado\n- Usamos Zustand, NO Redux\n- Stores en /stores\n\n## Componentes\n- Logica en hooks, no en componentes\n- UI con shadcn/ui"
        className="min-h-[200px] font-mono text-sm resize-none"
        disabled={isSaving}
      />
      <p className="text-xs text-muted-foreground">
        Escribe las convenciones del proyecto en Markdown. El agente las usara para generar codigo consistente.
      </p>
    </div>
  )
}
