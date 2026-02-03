/**
 * API Types for Dashboard
 *
 * Re-exports shared API types and defines dashboard-specific API utilities.
 */

import type { Task } from '@/features/tasks/types';

// Re-export API types from shared
export type {
  ExecuteResponse,
  ApproveResponse,
  CancelResponse,
  ExtendResponse,
  FeedbackResponse,
  RequestChangesResponse,
  PRMergedResponse,
  PRClosedResponse,
  PaginatedResponse,
  TaskFilters,
  AppError,
  ErrorCode,
  ApiError,
} from '@dash-agent/shared';

// Generic API response wrapper
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

// Paginated response (dashboard-specific format)
export interface DashboardPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Task-specific API responses
export type TaskResponse = ApiResponse<Task>;
export type TaskListResponse = Task[];
export type PaginatedTaskResponse = DashboardPaginatedResponse<Task>;

// WebSocket message types for real-time updates
export interface WebSocketMessage {
  type: 'task_update' | 'task_created' | 'task_deleted' | 'log_entry';
  payload: unknown;
}

export interface TaskUpdateMessage extends WebSocketMessage {
  type: 'task_update';
  payload: {
    task_id: string;
    task: Task;
  };
}

export interface LogEntryMessage extends WebSocketMessage {
  type: 'log_entry';
  payload: {
    task_id: string;
    entry: string;
    timestamp: string;
    level: 'info' | 'warning' | 'error' | 'debug';
  };
}

// Action response type for task actions (generic)
export interface ActionResponse {
  status: string;
  message?: string;
  pr_url?: string;
  new_timeout?: string;
}

// Cleanup worktree response
export interface CleanupWorktreeResponse {
  message: string;
}
