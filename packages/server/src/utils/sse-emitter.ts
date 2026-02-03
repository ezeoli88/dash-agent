import { EventEmitter } from 'events';
import type { Response } from 'express';
import { createLogger } from './logger.js';
import { getErrorMessage } from './errors.js';

const logger = createLogger('sse-emitter');

/**
 * Types of SSE events that can be emitted.
 */
export type SSEEventType =
  | 'log'
  | 'status'
  | 'timeout_warning'
  | 'awaiting_review'
  | 'complete'
  | 'error';

/**
 * SSE event data structures for each event type.
 */
export interface SSEEventData {
  log: {
    timestamp: string;
    level: string;
    message: string;
    data?: Record<string, unknown>;
  };
  status: {
    status: string;
  };
  timeout_warning: {
    message: string;
    expires_at: string;
  };
  awaiting_review: {
    message: string;
  };
  complete: {
    pr_url?: string;
    summary?: string;
  };
  error: {
    message: string;
    code?: string;
  };
}

/**
 * Generic SSE event structure.
 */
export interface SSEEvent<T extends SSEEventType = SSEEventType> {
  type: T;
  data: SSEEventData[T];
}

/**
 * SSE client connection information.
 */
interface SSEClient {
  id: string;
  taskId: string;
  response: Response;
  connectedAt: Date;
}

/**
 * SSE Emitter for broadcasting real-time events to connected clients.
 * Manages client connections per task and handles event distribution.
 */
export class SSEEmitter extends EventEmitter {
  /** Map of task ID to connected clients */
  private clients: Map<string, SSEClient[]> = new Map();

  /** Counter for generating unique client IDs */
  private clientIdCounter: number = 0;

  constructor() {
    super();
    this.setMaxListeners(100); // Allow many listeners for tasks
  }

  /**
   * Adds a new SSE client connection for a task.
   * Sets up the response headers and registers the client.
   *
   * @param taskId - The task ID to subscribe to
   * @param res - The Express response object
   * @returns The client ID
   */
  addClient(taskId: string, res: Response): string {
    const clientId = `client-${++this.clientIdCounter}`;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Prevent response compression which can buffer events
    res.setHeader('Content-Encoding', 'identity');

    // Flush headers immediately
    res.flushHeaders();

    const client: SSEClient = {
      id: clientId,
      taskId,
      response: res,
      connectedAt: new Date(),
    };

    // Add to task's client list
    const taskClients = this.clients.get(taskId) ?? [];
    taskClients.push(client);
    this.clients.set(taskId, taskClients);

    logger.debug('SSE client connected', { clientId, taskId });

    // Send initial connection event
    this.sendToClient(client, 'log', {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Connected to event stream',
    });

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(taskId, clientId);
    });

    return clientId;
  }

  /**
   * Removes a client connection.
   *
   * @param taskId - The task ID
   * @param clientId - The client ID to remove
   */
  removeClient(taskId: string, clientId: string): void {
    const taskClients = this.clients.get(taskId);
    if (!taskClients) return;

    const index = taskClients.findIndex((c) => c.id === clientId);
    if (index !== -1) {
      taskClients.splice(index, 1);
      logger.debug('SSE client disconnected', { clientId, taskId });
    }

    // Clean up empty client lists
    if (taskClients.length === 0) {
      this.clients.delete(taskId);
    }
  }

  /**
   * Sends an event to a specific client.
   *
   * @param client - The client to send to
   * @param type - The event type
   * @param data - The event data
   */
  private sendToClient<T extends SSEEventType>(
    client: SSEClient,
    type: T,
    data: SSEEventData[T]
  ): void {
    try {
      const eventString = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
      client.response.write(eventString);
    } catch (error) {
      logger.warn('Failed to send SSE event to client', {
        clientId: client.id,
        taskId: client.taskId,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Emits an event to all clients subscribed to a task.
   *
   * @param taskId - The task ID
   * @param type - The event type
   * @param data - The event data
   */
  emit<T extends SSEEventType>(taskId: string, type: T, data: SSEEventData[T]): boolean {
    const taskClients = this.clients.get(taskId);

    if (!taskClients || taskClients.length === 0) {
      // No clients connected, that's fine
      return false;
    }

    logger.debug('Broadcasting SSE event', { taskId, type, clientCount: taskClients.length });

    for (const client of taskClients) {
      this.sendToClient(client, type, data);
    }

    // Also emit on the EventEmitter for internal listeners
    super.emit(`${taskId}:${type}`, data);

    return true;
  }

  /**
   * Emits a log event for a task.
   *
   * @param taskId - The task ID
   * @param level - Log level
   * @param message - Log message
   * @param data - Optional additional data
   */
  emitLog(
    taskId: string,
    level: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    const logData: SSEEventData['log'] = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    if (data !== undefined) {
      logData.data = data;
    }
    this.emit(taskId, 'log', logData);
  }

  /**
   * Emits a status change event for a task.
   *
   * @param taskId - The task ID
   * @param status - The new status
   */
  emitStatus(taskId: string, status: string): void {
    this.emit(taskId, 'status', { status });
  }

  /**
   * Emits a timeout warning event for a task.
   *
   * @param taskId - The task ID
   * @param message - Warning message
   * @param expiresAt - When the timeout will occur
   */
  emitTimeoutWarning(taskId: string, message: string, expiresAt: Date): void {
    this.emit(taskId, 'timeout_warning', {
      message,
      expires_at: expiresAt.toISOString(),
    });
  }

  /**
   * Emits an awaiting review event for a task.
   *
   * @param taskId - The task ID
   * @param message - Review message
   */
  emitAwaitingReview(taskId: string, message: string): void {
    this.emit(taskId, 'awaiting_review', { message });
  }

  /**
   * Emits a completion event for a task and closes all connections.
   *
   * @param taskId - The task ID
   * @param prUrl - Optional PR URL
   * @param summary - Optional summary
   */
  emitComplete(taskId: string, prUrl?: string, summary?: string): void {
    const completeData: SSEEventData['complete'] = {};
    if (prUrl !== undefined) {
      completeData.pr_url = prUrl;
    }
    if (summary !== undefined) {
      completeData.summary = summary;
    }
    this.emit(taskId, 'complete', completeData);
    // Close connections after completion (terminal event)
    this.closeTask(taskId);
  }

  /**
   * Emits an error event for a task and closes all connections.
   *
   * @param taskId - The task ID
   * @param message - Error message
   * @param code - Optional error code
   */
  emitError(taskId: string, message: string, code?: string): void {
    const errorData: SSEEventData['error'] = { message };
    if (code !== undefined) {
      errorData.code = code;
    }
    this.emit(taskId, 'error', errorData);
    // Close connections after error (terminal event)
    this.closeTask(taskId);
  }

  /**
   * Emits an error event without closing connections.
   * Use this for non-terminal errors where the stream should continue.
   *
   * @param taskId - The task ID
   * @param message - Error message
   * @param code - Optional error code
   */
  emitErrorNonTerminal(taskId: string, message: string, code?: string): void {
    const errorData: SSEEventData['error'] = { message };
    if (code !== undefined) {
      errorData.code = code;
    }
    this.emit(taskId, 'error', errorData);
  }

  /**
   * Gets the number of connected clients for a task.
   *
   * @param taskId - The task ID
   * @returns Number of connected clients
   */
  getClientCount(taskId: string): number {
    return this.clients.get(taskId)?.length ?? 0;
  }

  /**
   * Checks if a task has any connected clients.
   *
   * @param taskId - The task ID
   * @returns True if the task has connected clients
   */
  hasClients(taskId: string): boolean {
    return this.getClientCount(taskId) > 0;
  }

  /**
   * Closes all connections for a task.
   *
   * @param taskId - The task ID
   */
  closeTask(taskId: string): void {
    const taskClients = this.clients.get(taskId);
    if (!taskClients) return;

    for (const client of taskClients) {
      try {
        client.response.end();
      } catch (error) {
        logger.debug('Error closing SSE client connection', {
          clientId: client.id,
          taskId,
          error: getErrorMessage(error),
        });
      }
    }

    this.clients.delete(taskId);
    logger.debug('Closed all SSE connections for task', { taskId });
  }
}

/** Singleton instance */
let sseEmitterInstance: SSEEmitter | null = null;

/**
 * Gets the SSE emitter instance.
 */
export function getSSEEmitter(): SSEEmitter {
  if (sseEmitterInstance === null) {
    sseEmitterInstance = new SSEEmitter();
  }
  return sseEmitterInstance;
}

export default getSSEEmitter;
