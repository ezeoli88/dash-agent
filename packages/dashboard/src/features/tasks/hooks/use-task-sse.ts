'use client'

import { useEffect, useCallback, useMemo, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { taskKeys } from './query-keys'
import { useTaskUIStore } from '../stores/task-ui-store'
import type {
  LogEntry,
  TaskStatus,
  SSEConnectionStatus,
  SSELogEvent,
  SSEStatusEvent,
  SSETimeoutWarningEvent,
  SSEAwaitingReviewEvent,
  SSECompleteEvent,
  SSEErrorEvent,
} from '../types'

// Re-export SSEConnectionStatus as ConnectionStatus for backwards compatibility
export type ConnectionStatus = SSEConnectionStatus;

interface UseTaskSSEOptions {
  taskId: string;
  enabled?: boolean;
  onStatusChange?: (status: TaskStatus) => void;
  onComplete?: (prUrl: string) => void;
  onError?: (message: string) => void;
  onTimeoutWarning?: (message: string, expiresAt: string) => void;
}

interface ConnectOptions {
  taskId: string;
  enabled: boolean;
  onLog: (log: LogEntry) => void;
  onStatusChange?: (status: TaskStatus) => void;
  onComplete?: (prUrl: string) => void;
  onError?: (message: string) => void;
  onTimeoutWarning?: (message: string, expiresAt: string) => void;
  invalidateQueries: () => void;
}

// Connection manager class to handle SSE connections outside of React render cycle
function createSSEConnectionManager() {
  let eventSource: EventSource | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let status: ConnectionStatus = 'disconnected';
  const listeners = new Set<() => void>();

  function setStatus(newStatus: ConnectionStatus) {
    status = newStatus;
    listeners.forEach(listener => listener());
  }

  function disconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    setStatus('disconnected');
  }

  function connect(options: ConnectOptions) {
    const { taskId, enabled, onLog, onStatusChange, onComplete, onError, onTimeoutWarning, invalidateQueries } = options;

    if (!enabled || !taskId) return;

    // Close existing connection
    disconnect();

    setStatus('connecting');

    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    const url = `${baseUrl}/tasks/${taskId}/logs`;

    try {
      const es = new EventSource(url);
      eventSource = es;

      es.onopen = () => {
        setStatus('connected');
      };

      // Handle 'log' event - new log entry from agent execution
      es.addEventListener('log', (event) => {
        try {
          const parsed = JSON.parse(event.data) as SSELogEvent['data'];
          onLog({
            id: crypto.randomUUID(),
            timestamp: parsed.timestamp,
            level: parsed.level,
            message: parsed.message,
            data: parsed.data,
          });
        } catch (e) {
          console.error('Failed to parse log event:', e);
        }
      });

      // Handle 'status' event - task status changed
      es.addEventListener('status', (event) => {
        try {
          const parsed = JSON.parse(event.data) as SSEStatusEvent['data'];
          onStatusChange?.(parsed.status);
          invalidateQueries();
        } catch (e) {
          console.error('Failed to parse status event:', e);
        }
      });

      // Handle 'timeout_warning' event - agent is about to timeout
      es.addEventListener('timeout_warning', (event) => {
        try {
          const parsed = JSON.parse(event.data) as SSETimeoutWarningEvent['data'];
          onTimeoutWarning?.(parsed.message, parsed.expires_at);
        } catch (e) {
          console.error('Failed to parse timeout_warning event:', e);
        }
      });

      // Handle 'awaiting_review' event - agent needs user review
      es.addEventListener('awaiting_review', (event) => {
        try {
          const parsed = JSON.parse(event.data) as SSEAwaitingReviewEvent['data'];
          // Add as a special log entry
          onLog({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            level: 'agent',
            message: parsed.message,
          });
          invalidateQueries();
        } catch (e) {
          console.error('Failed to parse awaiting_review event:', e);
        }
      });

      // Handle 'complete' event - task execution completed successfully
      es.addEventListener('complete', (event) => {
        try {
          const parsed = JSON.parse(event.data) as SSECompleteEvent['data'];
          onComplete?.(parsed.pr_url ?? '');
          invalidateQueries();
          es.close();
          setStatus('disconnected');
        } catch (e) {
          console.error('Failed to parse complete event:', e);
        }
      });

      // Handle 'error' event - task execution failed
      es.addEventListener('error', (event) => {
        try {
          const parsed = JSON.parse((event as MessageEvent).data) as SSEErrorEvent['data'];
          // Don't trigger onError for cancelled tasks - the cancel action already shows a toast
          if (parsed.code !== 'CANCELLED') {
            onError?.(parsed.message);
          }
        } catch {
          // Connection error, not a data error - handled by onerror
        }
      });

      es.onerror = () => {
        setStatus('error');
        es.close();
        // Auto-reconnect after 3 seconds
        reconnectTimeout = setTimeout(() => {
          if (enabled) connect(options);
        }, 3000);
      };
    } catch (e) {
      console.error('Failed to create EventSource:', e);
      setStatus('error');
    }
  }

  return {
    connect,
    disconnect,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => status,
  };
}

export function useTaskSSE(options: UseTaskSSEOptions) {
  const { taskId, enabled = true, onStatusChange, onComplete, onError, onTimeoutWarning } = options;
  const queryClient = useQueryClient();

  // Use Zustand store for logs persistence across tab switches
  const { taskLogs, addTaskLog, clearTaskLogs } = useTaskUIStore();
  const logs = taskLogs[taskId] || [];

  // Create stable manager instance using useMemo
  const manager = useMemo(() => createSSEConnectionManager(), []);

  // Use useSyncExternalStore to subscribe to connection status
  const connectionStatus = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    () => 'disconnected' as ConnectionStatus
  );

  // Memoize connect options to use latest callbacks
  const connectOptions = useMemo((): ConnectOptions => ({
    taskId,
    enabled,
    onLog: (log) => addTaskLog(taskId, log),
    onStatusChange,
    onComplete,
    onError,
    onTimeoutWarning,
    invalidateQueries: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  }), [taskId, enabled, onStatusChange, onComplete, onError, onTimeoutWarning, queryClient, addTaskLog]);

  // Connect/disconnect effect
  useEffect(() => {
    if (!enabled || !taskId) {
      manager.disconnect();
      return;
    }

    manager.connect(connectOptions);

    return () => {
      manager.disconnect();
    };
  }, [taskId, enabled, manager, connectOptions]);

  const clearLogs = useCallback(() => {
    clearTaskLogs(taskId);
  }, [taskId, clearTaskLogs]);

  const addLog = useCallback((entry: Omit<LogEntry, 'id'>) => {
    addTaskLog(taskId, {
      id: crypto.randomUUID(),
      ...entry
    });
  }, [taskId, addTaskLog]);

  const reconnect = useCallback(() => {
    manager.connect(connectOptions);
  }, [manager, connectOptions]);

  const disconnect = useCallback(() => {
    manager.disconnect();
  }, [manager]);

  return {
    logs,
    connectionStatus,
    clearLogs,
    addLog,
    reconnect,
    disconnect,
  };
}
