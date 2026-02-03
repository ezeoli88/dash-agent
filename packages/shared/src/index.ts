/**
 * @agent-board/shared
 *
 * Shared types and schemas for Agent Board frontend and backend.
 * This package serves as the single source of truth for all TypeScript types
 * and Zod validation schemas used across the application.
 */

// ============================================================================
// Schemas (Zod validation + inferred types)
// ============================================================================

// Task schemas
export {
  TASK_STATUSES,
  TaskStatusSchema,
  TaskSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  type TaskStatus,
  type Task,
  type CreateTaskInput,
  type UpdateTaskInput,
} from './schemas/task.schema.js';

// Feedback schemas
export {
  FeedbackSchema,
  RequestChangesSchema,
  type FeedbackInput,
  type RequestChangesInput,
} from './schemas/feedback.schema.js';

// API schemas
export {
  FileChangeStatusSchema,
  FileChangeSchema,
  ChangesSummarySchema,
  TaskChangesResponseSchema,
  ApiErrorDetailSchema,
  ApiErrorSchema,
} from './schemas/api.schema.js';

// ============================================================================
// Types (pure TypeScript types and utilities)
// ============================================================================

// Task type utilities
export {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  getAvailableActionsForStatus,
  isTerminalStatus,
  isActiveStatus,
  requiresUserAction,
} from './types/task.types.js';

// SSE types
export type {
  LogLevel,
  LogEntry,
  SSEEventType,
  SSELogEvent,
  SSEStatusEvent,
  SSETimeoutWarningEvent,
  SSEAwaitingReviewEvent,
  SSECompleteEvent,
  SSEErrorEvent,
  SSEEvent,
  SSEConnectionStatus,
} from './types/sse.types.js';

// API types
export {
  ERROR_CODES,
  type ErrorCode,
  type AppError,
  type ExecuteResponse,
  type ApproveResponse,
  type CancelResponse,
  type ExtendResponse,
  type FeedbackResponse,
  type RequestChangesResponse,
  type PRMergedResponse,
  type PRClosedResponse,
  type PaginationParams,
  type PaginatedResponse,
  type TaskFilters,
  type FileChangeStatus,
  type FileChange,
  type ChangesSummary,
  type TaskChangesResponse,
  type ApiError,
} from './types/api.types.js';
