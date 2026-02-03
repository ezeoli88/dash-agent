/**
 * Task Types - Re-exports from @dash-agent/shared
 *
 * This file re-exports shared types and adds frontend-specific utilities.
 * The single source of truth for types is @dash-agent/shared.
 */

// ============================================================================
// Core Task Types (from @dash-agent/shared)
// ============================================================================

export {
  // Task schemas and types
  TASK_STATUSES,
  type TaskStatus,
  type Task,
  type CreateTaskInput,
  type UpdateTaskInput,
  // Task utilities
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  getAvailableActionsForStatus,
  isTerminalStatus,
  isActiveStatus,
  requiresUserAction,
  // SSE types
  type LogLevel,
  type LogEntry,
  type SSEEventType,
  type SSELogEvent,
  type SSEStatusEvent,
  type SSETimeoutWarningEvent,
  type SSEAwaitingReviewEvent,
  type SSECompleteEvent,
  type SSEErrorEvent,
  type SSEEvent,
  type SSEConnectionStatus,
  // File change types (for diff viewer)
  type FileChangeStatus,
  type FileChange,
  type ChangesSummary,
  type TaskChangesResponse,
  // API response types
  type ExecuteResponse,
  type ApproveResponse,
  type CancelResponse,
  type ExtendResponse,
  type FeedbackResponse,
  type RequestChangesResponse,
  type PRMergedResponse,
  type PRClosedResponse,
} from '@dash-agent/shared';
