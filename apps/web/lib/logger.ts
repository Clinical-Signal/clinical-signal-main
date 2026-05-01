/**
 * Lightweight server-side logger.
 *
 * In production, suppresses debug/info logs to keep output clean.
 * Errors always log (they're actionable). Debug logs only appear
 * when NODE_ENV !== 'production'.
 *
 * HIPAA: Never log PHI (patient names, DOBs, lab values).
 * Acceptable to log: tenant IDs, patient IDs, protocol IDs, timing.
 */

const IS_PROD = process.env.NODE_ENV === "production";

/** Debug-level log — suppressed in production. */
export function logDebug(tag: string, ...args: unknown[]) {
  if (!IS_PROD) {
    console.log(`[${tag}]`, ...args);
  }
}

/** Error-level log — always emitted. */
export function logError(tag: string, ...args: unknown[]) {
  console.error(`[${tag}]`, ...args);
}
