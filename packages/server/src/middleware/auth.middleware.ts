import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('auth');

let serverToken: string | null = null;

/**
 * Stores the server's startup authentication token.
 */
export function setAuthToken(token: string): void {
  serverToken = token;
}

/**
 * Returns the current authentication token.
 */
export function getAuthToken(): string | null {
  return serverToken;
}

/**
 * Express middleware that requires a valid auth token.
 * Checks Authorization: Bearer <token> header first, then ?token=<token> query param
 * (needed for EventSource/SSE which doesn't support custom headers).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!serverToken) {
    // Auth not configured (shouldn't happen, but fail open in this edge case)
    next();
    return;
  }

  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer' && parts[1] === serverToken) {
      next();
      return;
    }
  }

  // Check query param (for EventSource/SSE)
  const queryToken = req.query.token as string | undefined;
  if (queryToken && queryToken === serverToken) {
    next();
    return;
  }

  logger.warn('Unauthorized request', { path: req.path, ip: req.ip });
  res.status(401).json({ error: 'Unauthorized', message: 'Valid authentication token required' });
}
