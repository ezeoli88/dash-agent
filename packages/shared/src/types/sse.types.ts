import type { TaskStatus } from '../schemas/task.schema.js';

/**
 * Log levels for task execution logs
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'agent' | 'user';

/**
 * Log entry representing a single log message
 */
export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * SSE event types from backend
 */
export type SSEEventType =
  | 'log'
  | 'status'
  | 'timeout_warning'
  | 'awaiting_review'
  | 'complete'
  | 'error';

/**
 * SSE log event - new log entry from agent execution
 */
export interface SSELogEvent {
  type: 'log';
  data: {
    timestamp: string;
    level: LogLevel;
    message: string;
    data?: Record<string, unknown>;
  };
}

/**
 * SSE status event - task status changed
 */
export interface SSEStatusEvent {
  type: 'status';
  data: {
    status: TaskStatus;
  };
}

/**
 * SSE timeout warning event - agent is about to timeout
 */
export interface SSETimeoutWarningEvent {
  type: 'timeout_warning';
  data: {
    message: string;
    expires_at: string;
  };
}

/**
 * SSE awaiting review event - agent needs user review
 */
export interface SSEAwaitingReviewEvent {
  type: 'awaiting_review';
  data: {
    message: string;
  };
}

/**
 * SSE complete event - task execution completed successfully
 */
export interface SSECompleteEvent {
  type: 'complete';
  data: {
    pr_url?: string;
    summary?: string;
  };
}

/**
 * SSE error event - task execution failed
 */
export interface SSEErrorEvent {
  type: 'error';
  data: {
    message: string;
    code?: string;
  };
}

/**
 * Union type for all SSE events
 */
export type SSEEvent =
  | SSELogEvent
  | SSEStatusEvent
  | SSETimeoutWarningEvent
  | SSEAwaitingReviewEvent
  | SSECompleteEvent
  | SSEErrorEvent;

/**
 * Connection status for SSE client
 */
export type SSEConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';
