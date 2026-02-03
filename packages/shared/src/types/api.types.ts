import type { TaskStatus } from '../schemas/task.schema.js';

// Re-export schema types for convenience
export type {
  FileChangeStatus,
  FileChange,
  ChangesSummary,
  TaskChangesResponse,
  ApiError,
} from '../schemas/api.schema.js';

/**
 * Response when starting task execution
 */
export interface ExecuteResponse {
  status: 'started';
  message: string;
  resume_mode: boolean;
}

/**
 * Response when approving a task (creates PR)
 */
export interface ApproveResponse {
  status: 'approved';
  pr_url: string;
}

/**
 * Response when cancelling task execution
 */
export interface CancelResponse {
  status: 'cancelled';
}

/**
 * Response when extending task timeout
 */
export interface ExtendResponse {
  status: 'extended';
  new_timeout: string;
}

/**
 * Response when sending feedback to the agent
 */
export interface FeedbackResponse {
  status: 'feedback_sent';
}

/**
 * Response when requesting changes on a PR
 */
export interface RequestChangesResponse {
  status: 'changes_requested';
  message: string;
}

/**
 * Response when marking a PR as merged
 */
export interface PRMergedResponse {
  status: 'done';
  message: string;
}

/**
 * Response when marking a PR as closed
 */
export interface PRClosedResponse {
  status: 'failed';
  message: string;
}

/**
 * Error codes used throughout the application
 */
export const ERROR_CODES = {
  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_TASK_ID: 'INVALID_TASK_ID',

  // Task state errors
  INVALID_TASK_STATUS: 'INVALID_TASK_STATUS',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',

  // Agent errors
  AGENT_ALREADY_RUNNING: 'AGENT_ALREADY_RUNNING',
  NO_ACTIVE_AGENT: 'NO_ACTIVE_AGENT',
  AGENT_TIMEOUT: 'TIMEOUT',
  AGENT_CANCELLED: 'CANCELLED',

  // Git/GitHub errors
  NO_WORKTREE: 'NO_WORKTREE',
  GIT_ERROR: 'GIT_ERROR',
  GITHUB_ERROR: 'GITHUB_ERROR',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
} as const;

/**
 * Error code type
 */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Structured application error
 */
export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

/**
 * Pagination parameters for list endpoints
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Filter parameters for task list endpoint
 */
export interface TaskFilters {
  status?: TaskStatus[];
  search?: string;
}
