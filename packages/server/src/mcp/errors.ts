import type { ZodIssue } from "zod";
import { getErrorMessage } from "../utils/errors.js";

/**
 * Structured error codes for MCP tool responses.
 */
export const McpErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  REPOSITORY_NOT_FOUND: "REPOSITORY_NOT_FOUND",
  INVALID_TASK_STATUS: "INVALID_TASK_STATUS",
  DUPLICATE_REPOSITORY: "DUPLICATE_REPOSITORY",
  AGENT_NOT_RUNNING: "AGENT_NOT_RUNNING",
  TASK_IN_TERMINAL_STATE: "TASK_IN_TERMINAL_STATE",
  NO_CHANGES_AVAILABLE: "NO_CHANGES_AVAILABLE",
  LOCAL_REPO_NO_ORIGIN: "LOCAL_REPO_NO_ORIGIN",
  LOCAL_REPO_ORIGIN_IS_LOCAL: "LOCAL_REPO_ORIGIN_IS_LOCAL",
  LOCAL_REPO_PATH_NOT_FOUND: "LOCAL_REPO_PATH_NOT_FOUND",
  LOCAL_REPO_INVALID: "LOCAL_REPO_INVALID",
  REMOTE_PROVIDER_NOT_SUPPORTED: "REMOTE_PROVIDER_NOT_SUPPORTED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type McpErrorCode = (typeof McpErrorCode)[keyof typeof McpErrorCode];

/** Standard shape returned by MCP tool handlers. */
export interface McpToolResponse {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Builds a structured MCP error response.
 * The text field contains a JSON object with code, message, and optional hint
 * so it's both LLM-readable and programmatically parseable.
 */
export function mcpError(
  code: McpErrorCode,
  message: string,
  hint?: string
): McpToolResponse {
  const payload: { code: McpErrorCode; message: string; hint?: string } = {
    code,
    message,
  };
  if (hint) {
    payload.hint = hint;
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    isError: true,
  };
}

/**
 * Builds a structured validation error from Zod issues.
 */
export function mcpValidationError(issues: ZodIssue[]): McpToolResponse {
  return mcpError(
    McpErrorCode.VALIDATION_ERROR,
    `Validation failed: ${issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    "Check the field-level details above and fix the input."
  );
}

/**
 * Maps known PR creation error messages to structured MCP error responses.
 * Returns null if the error doesn't match a known pattern.
 */
export function mapPRCreationError(
  errorMessage: string
): McpToolResponse | null {
  if (errorMessage.includes('no tiene un remote "origin"')) {
    return mcpError(
      McpErrorCode.LOCAL_REPO_NO_ORIGIN,
      errorMessage,
      "Configure a GitHub/GitLab remote origin in the repo and retry approve_changes."
    );
  }
  if (errorMessage.includes("apunta a una ruta local")) {
    return mcpError(
      McpErrorCode.LOCAL_REPO_ORIGIN_IS_LOCAL,
      errorMessage,
      "The remote origin must point to GitHub/GitLab, not a local path."
    );
  }
  if (errorMessage.includes("ya no existe")) {
    return mcpError(
      McpErrorCode.LOCAL_REPO_PATH_NOT_FOUND,
      errorMessage,
      "Re-register the repository with add_repository using the correct path."
    );
  }
  if (errorMessage.includes("no es un repositorio Git válido")) {
    return mcpError(
      McpErrorCode.LOCAL_REPO_INVALID,
      errorMessage,
      "The path is not a valid Git repository. Re-register with add_repository."
    );
  }
  if (errorMessage.includes("solo soporta GitHub/GitLab")) {
    return mcpError(
      McpErrorCode.REMOTE_PROVIDER_NOT_SUPPORTED,
      errorMessage,
      "Only GitHub and GitLab are supported for PR creation."
    );
  }
  return null;
}

/**
 * Builds an INTERNAL_ERROR response from an unknown caught error.
 */
export function mcpInternalError(
  context: string,
  error: unknown
): McpToolResponse {
  return mcpError(
    McpErrorCode.INTERNAL_ERROR,
    `${context}: ${getErrorMessage(error)}`,
    "An unexpected error occurred. Check server logs for details."
  );
}
