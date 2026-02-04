'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { DeleteResponse } from '../types'

/**
 * Hook for deleting all application data
 */
export function useDeleteData() {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const deleteAllData = useCallback(async () => {
    setIsDeleting(true)
    setError(null)

    try {
      const response = await apiClient.delete<DeleteResponse>('/data', {
        body: { confirmation: 'DELETE' },
      })

      // Invalidate all queries to refresh data
      await queryClient.invalidateQueries()

      return response
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete data'
      setError(message)
      throw err
    } finally {
      setIsDeleting(false)
    }
  }, [queryClient])

  return {
    deleteAllData,
    isDeleting,
    error,
  }
}
