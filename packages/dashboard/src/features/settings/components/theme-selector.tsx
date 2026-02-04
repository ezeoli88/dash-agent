'use client'

import { useTheme } from 'next-themes'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { THEME_OPTIONS, type Theme } from '../types'

/**
 * Theme selector component using radio buttons
 */
export function ThemeSelector() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Tema</Label>
      <RadioGroup
        value={theme}
        onValueChange={(value) => setTheme(value as Theme)}
        className="flex gap-6"
      >
        {THEME_OPTIONS.map((option) => (
          <div key={option.value} className="flex items-center space-x-2">
            <RadioGroupItem value={option.value} id={`theme-${option.value}`} />
            <Label
              htmlFor={`theme-${option.value}`}
              className="cursor-pointer font-normal"
            >
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  )
}
