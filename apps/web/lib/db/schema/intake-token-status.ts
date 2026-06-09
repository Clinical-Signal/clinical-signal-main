/** Magic-link lifecycle for patient intake URLs (SEC-18). */
export const INTAKE_TOKEN_STATUSES = [
  "pending",
  "completed",
  "expired",
] as const;

export type IntakeTokenStatus = (typeof INTAKE_TOKEN_STATUSES)[number];
