import type { Response } from 'express';
import { createLogger } from './logger.js';
import { getErrorMessage } from './errors.js';

const logger = createLogger('data-events');

/**
 * Represents a data change event emitted when entities are created, updated, or deleted.
 * The frontend uses these events to invalidate TanStack Query caches.
 */
export interface DataChangeEvent {
  entity: 'task' | 'repo';
  action: 'created' | 'updated' | 'deleted';
  id?: string;
}

/**
 * Heartbeat interval in milliseconds.
 * Sends a comment line every 30 seconds to keep SSE connections alive
 * and detect stale connections early.
 */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Manages SSE connections for broadcasting data change events to all connected clients.
 * When tasks or repos are modified via the API (e.g., from an MCP client),
 * this emitter pushes lightweight events so the frontend can invalidate
 * the right TanStack Query caches without polling.
 */
class DataEventEmitter {
  private clients: Set<Response> = new Set();
  private heartbeatIntervals: Map<Response, ReturnType<typeof setInterval>> = new Map();

  /**
   * Registers a new SSE client connection.
   * Sets appropriate headers, sends an initial comment to establish the stream,
   * and starts a heartbeat to keep the connection alive.
   */
  addClient(res: Response): void {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'identity');
    res.flushHeaders();

    // Send initial comment to establish connection
    res.write(': connected\n\n');

    this.clients.add(res);
    logger.debug('Data events SSE client connected', { totalClients: this.clients.size });

    // Start heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (error) {
        logger.debug('Heartbeat failed, removing client', {
          error: getErrorMessage(error),
        });
        this.removeClient(res);
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatIntervals.set(res, heartbeat);

    // Clean up on client disconnect
    res.on('close', () => {
      this.removeClient(res);
    });
  }

  /**
   * Removes a client and cleans up its heartbeat interval.
   */
  private removeClient(res: Response): void {
    const heartbeat = this.heartbeatIntervals.get(res);
    if (heartbeat) {
      clearInterval(heartbeat);
      this.heartbeatIntervals.delete(res);
    }
    this.clients.delete(res);
    logger.debug('Data events SSE client disconnected', { totalClients: this.clients.size });
  }

  /**
   * Broadcasts a data change event to all connected SSE clients.
   * Uses the `data-change` event type so the frontend can listen specifically for it.
   */
  emitChange(event: DataChangeEvent): void {
    if (this.clients.size === 0) return;

    const data = JSON.stringify(event);
    logger.debug('Broadcasting data change event', {
      entity: event.entity,
      action: event.action,
      id: event.id,
      clientCount: this.clients.size,
    });

    for (const client of this.clients) {
      try {
        client.write(`event: data-change\ndata: ${data}\n\n`);
      } catch (error) {
        logger.debug('Failed to send data change event, removing client', {
          error: getErrorMessage(error),
        });
        this.removeClient(client);
      }
    }
  }

  /**
   * Returns the number of currently connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

/** Singleton instance */
let instance: DataEventEmitter | null = null;

/**
 * Gets the global DataEventEmitter singleton instance.
 */
export function getDataEventEmitter(): DataEventEmitter {
  if (instance === null) {
    instance = new DataEventEmitter();
  }
  return instance;
}
