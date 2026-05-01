/**
 * Centralized API error handling.
 *
 * Logs full error details server-side for debugging, returns sanitized
 * error codes to the client. Prevents leaking database schema, file paths,
 * and internal state through API responses — critical for HIPAA compliance.
 */

/** Error codes returned to the client. */
export const ERROR_CODES = {
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  ANALYSIS_FAILED: "ANALYSIS_FAILED",
  PROTOCOL_GENERATION_FAILED: "PROTOCOL_GENERATION_FAILED",
  BRIEF_GENERATION_FAILED: "BRIEF_GENERATION_FAILED",
  EXPORT_FAILED: "EXPORT_FAILED",
  UPLOAD_FAILED: "UPLOAD_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Log the full error server-side and return a sanitized JSON response.
 * Never sends err.message to the client.
 */
export function apiError(
  code: ErrorCode,
  status: number,
  err?: unknown,
  context?: Record<string, unknown>,
): Response {
  // Log full error server-side for debugging (no PHI in logs)
  if (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[API Error] ${code}:`, msg, context ?? "", stack ?? "");
  }

  return Response.json(
    { error: code, ...(context ? { context } : {}) },
    { status },
  );
}

/**
 * Sanitize an error message for streaming responses (prep brief, analyze,
 * generate-protocol). These routes send JSON lines to the client, so we
 * can't use Response.json. Instead, return a sanitized error code.
 */
export function sanitizeStreamError(code: ErrorCode, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[Stream Error] ${code}:`, msg);
  return code;
}
