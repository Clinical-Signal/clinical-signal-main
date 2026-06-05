/** Logs an error without dumping request bodies or PHI-bearing fields. */
export function logSafeError(tag: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(tag, message);
}
