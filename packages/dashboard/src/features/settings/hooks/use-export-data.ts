'use client'

import { useState, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import type { ExportData } from '../types'

/**
 * Hook for exporting application data
 */
export function useExportData() {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const exportData = useCallback(async () => {
    setIsExporting(true)
    setError(null)

    try {
      // Fetch data from backend
      const data = await apiClient.get<ExportData>('/data/export')

      // Create blob and download
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)

      // Create temporary link and trigger download
      const link = document.createElement('a')
      link.href = url
      link.download = `dash-agent-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Cleanup
      URL.revokeObjectURL(url)

      return data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export data'
      setError(message)
      throw err
    } finally {
      setIsExporting(false)
    }
  }, [])

  return {
    exportData,
    isExporting,
    error,
  }
}
