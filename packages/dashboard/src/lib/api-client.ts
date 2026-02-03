import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskChangesResponse,
  RequestChangesResponse,
  PRMergedResponse,
  PRClosedResponse,
} from '@/features/tasks/types';
import type { ActionResponse, CleanupWorktreeResponse } from '@/types/api';

// API error response from backend (matches shared ApiError schema)
interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: { field: string; message: string }[];
  code?: string;
}

// Base URL from environment variables
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

// Custom error class for API errors
export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: Record<string, string[]>;

  constructor(message: string, statusCode: number, code?: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// Request options type
interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

// Build URL with query parameters
function buildUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(endpoint, API_BASE_URL);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
}

// Generic fetch wrapper
async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers: customHeaders, ...restOptions } = options;

  const url = buildUrl(endpoint, params);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  const config: RequestInit = {
    ...restOptions,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  };

  try {
    const response = await fetch(url, config);

    // Handle non-OK responses
    if (!response.ok) {
      let errorData: ApiErrorResponse | null = null;

      try {
        errorData = await response.json();
      } catch {
        // Response is not JSON
      }

      // Convert array-based details to Record format
      let details: Record<string, string[]> | undefined;
      if (errorData?.details) {
        details = {};
        for (const detail of errorData.details) {
          if (!details[detail.field]) {
            details[detail.field] = [];
          }
          details[detail.field].push(detail.message);
        }
      }

      throw new ApiClientError(
        errorData?.message || errorData?.error || `HTTP Error: ${response.status} ${response.statusText}`,
        response.status,
        errorData?.code,
        details
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    // Network or other errors
    throw new ApiClientError(
      error instanceof Error ? error.message : 'An unknown error occurred',
      0
    );
  }
}

// API client with typed methods
export const apiClient = {
  // Generic methods
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'POST', body }),

  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PUT', body }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PATCH', body }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),

  // Task-specific endpoints
  tasks: {
    getAll: (params?: { status?: string; search?: string }) =>
      apiClient.get<Task[]>('/tasks', { params }),

    getById: (id: string) =>
      apiClient.get<Task>(`/tasks/${id}`),

    create: (data: CreateTaskInput) =>
      apiClient.post<Task>('/tasks', data),

    update: (id: string, data: UpdateTaskInput) =>
      apiClient.patch<Task>(`/tasks/${id}`, data),

    delete: (id: string) =>
      apiClient.delete<void>(`/tasks/${id}`),

    // Task actions
    start: (id: string) =>
      apiClient.post<Task>(`/tasks/${id}/start`),

    cancel: (id: string) =>
      apiClient.post<Task>(`/tasks/${id}/cancel`),

    retry: (id: string) =>
      apiClient.post<Task>(`/tasks/${id}/retry`),

    // Get task logs
    getLogs: (id: string) =>
      apiClient.get<string[]>(`/tasks/${id}/logs`),
  },
};

// Standalone tasksApi for use with TanStack Query hooks
export const tasksApi = {
  getAll: async (filters?: { status?: string[]; search?: string }) => {
    const params: Record<string, string | undefined> = {}

    if (filters?.status && filters.status.length > 0) {
      params.status = filters.status.join(',')
    }
    if (filters?.search) {
      params.search = filters.search
    }

    return apiClient.get<Task[]>('/tasks', { params })
  },

  getById: (id: string) => apiClient.get<Task>(`/tasks/${id}`),

  create: (data: CreateTaskInput) => apiClient.post<Task>('/tasks', data),

  update: (id: string, data: UpdateTaskInput) =>
    apiClient.patch<Task>(`/tasks/${id}`, data),

  delete: (id: string) => apiClient.delete<void>(`/tasks/${id}`),

  getLogs: (id: string) => apiClient.get<string[]>(`/tasks/${id}/logs`),

  // Task action endpoints (return ActionResponse)
  execute: (id: string) => apiClient.post<ActionResponse>(`/tasks/${id}/execute`),

  approve: (id: string) => apiClient.post<ActionResponse>(`/tasks/${id}/approve`),

  cancel: (id: string) => apiClient.post<ActionResponse>(`/tasks/${id}/cancel`),

  extend: (id: string) => apiClient.post<ActionResponse>(`/tasks/${id}/extend`),

  feedback: (id: string, message: string) =>
    apiClient.post<ActionResponse>(`/tasks/${id}/feedback`, { message }),

  // PR-related action endpoints
  requestChanges: (id: string, feedback: string) =>
    apiClient.post<RequestChangesResponse>(`/tasks/${id}/request-changes`, { feedback }),

  markPRMerged: (id: string) =>
    apiClient.post<PRMergedResponse>(`/tasks/${id}/pr-merged`),

  markPRClosed: (id: string) =>
    apiClient.post<PRClosedResponse>(`/tasks/${id}/pr-closed`),

  getChanges: (id: string): Promise<TaskChangesResponse> =>
    apiClient.get<TaskChangesResponse>(`/tasks/${id}/changes`),

  cleanupWorktree: (id: string): Promise<CleanupWorktreeResponse> =>
    apiClient.post<CleanupWorktreeResponse>(`/tasks/${id}/cleanup-worktree`),
}

// Export types for consumers
export type { RequestOptions };

// Export ActionResponse for external use
export type { ActionResponse, CleanupWorktreeResponse };
