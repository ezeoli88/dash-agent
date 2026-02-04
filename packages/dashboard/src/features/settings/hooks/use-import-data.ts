'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ImportResponse } from '../types'

interface ImportOptions {
  merge?: boolean
}

/**
 * Hook for importing application data
 */
export function useImportData() {
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const importData = useCallback(
    async (file: File, options: ImportOptions = {}) => {
      setIsImporting(true)
      setError(null)

      try {
        // Read file content
        const content = await file.text()
        const data = JSON.parse(content)

        // Validate basic structure
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid data format')
        }

        // Send to backend
        const params: Record<string, string> = {}
        if (options.merge) {
          params.merge = 'true'
        }

        const response = await apiClient.post<ImportResponse>(
          '/data/import',
          data,
          { params }
        )

        // Invalidate all queries to refresh data
        await queryClient.invalidateQueries()

        return response
      } catch (err) {
        let message = 'Failed to import data'
        if (err instanceof SyntaxError) {
          message = 'Invalid JSON file'
        } else if (err instanceof Error) {
          message = err.message
        }
        setError(message)
        throw err
      } finally {
        setIsImporting(false)
      }
    },
    [queryClient]
  )

  const selectFile = useCallback(() => {
    return new Promise<File | null>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,application/json'
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        resolve(file || null)
      }
      input.click()
    })
  }, [])

  return {
    importData,
    selectFile,
    isImporting,
    error,
  }
}
