/** Formats provider errors for the diagnostic endpoint (no PHI). */
export function integrationErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) {
    return `Error: ${String(error)}`;
  }

  const extended = error as Error & {
    Code?: string;
    code?: string;
    statusCode?: number;
    $metadata?: { httpStatusCode?: number };
  };

  const parts = [`Error: ${error.message}`];
  const code = extended.Code ?? extended.code;
  if (code) {
    parts.push(`code=${code}`);
  }
  if (error.name && error.name !== "Error") {
    parts.push(`type=${error.name}`);
  }
  const status =
    extended.statusCode ?? extended.$metadata?.httpStatusCode;
  if (status !== undefined) {
    parts.push(`httpStatus=${status}`);
  }

  return parts.join(" | ");
}
