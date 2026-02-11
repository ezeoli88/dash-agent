import { randomBytes } from 'crypto';

/**
 * Generates a cryptographically secure startup token.
 * Returns a 64-character hex string.
 */
export function generateStartupToken(): string {
  return randomBytes(32).toString('hex');
}
