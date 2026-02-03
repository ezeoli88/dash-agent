/**
 * Utility functions for error handling.
 */

/**
 * Extracts a string message from an unknown error value.
 * Handles Error instances, strings, and other values.
 *
 * @param error - The error value to extract a message from
 * @returns The error message as a string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export default { getErrorMessage };
