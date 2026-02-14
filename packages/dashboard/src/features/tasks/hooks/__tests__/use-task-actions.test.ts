import { describe, it, expect } from 'vitest'
import { ApiClientError } from '@/lib/api-client'
import { getApproveTaskErrorMessage } from '../use-task-actions'

describe('getApproveTaskErrorMessage', () => {
  it('maps LOCAL_REPO_NO_ORIGIN to a clear UI message', () => {
    const error = new ApiClientError('backend message', 400, 'LOCAL_REPO_NO_ORIGIN')
    const message = getApproveTaskErrorMessage(error)
    expect(message).toContain('no tiene remote origin')
  })

  it('maps LOCAL_REPO_ORIGIN_IS_LOCAL to a clear UI message', () => {
    const error = new ApiClientError('backend message', 400, 'LOCAL_REPO_ORIGIN_IS_LOCAL')
    const message = getApproveTaskErrorMessage(error)
    expect(message).toContain('ruta local')
  })

  it('maps LOCAL_REPO_PATH_NOT_FOUND to a clear UI message', () => {
    const error = new ApiClientError('backend message', 400, 'LOCAL_REPO_PATH_NOT_FOUND')
    const message = getApproveTaskErrorMessage(error)
    expect(message).toContain('ruta del repo local no existe')
  })

  it('maps LOCAL_REPO_INVALID to a clear UI message', () => {
    const error = new ApiClientError('backend message', 400, 'LOCAL_REPO_INVALID')
    const message = getApproveTaskErrorMessage(error)
    expect(message).toContain('no es un repositorio Git valido')
  })

  it('maps REMOTE_PROVIDER_NOT_SUPPORTED to a clear UI message', () => {
    const error = new ApiClientError('backend message', 400, 'REMOTE_PROVIDER_NOT_SUPPORTED')
    const message = getApproveTaskErrorMessage(error)
    expect(message).toContain('GitHub o GitLab')
  })

  it('falls back to default message for unknown errors', () => {
    const error = new Error('Unexpected boom')
    const message = getApproveTaskErrorMessage(error)
    expect(message).toBe('Failed to approve task: Unexpected boom')
  })
})
