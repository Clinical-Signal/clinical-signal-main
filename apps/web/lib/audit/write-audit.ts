/**
 * Intake module audit writer stub (PRD Phase 0.6 / C-AUDIT).
 * Separate from legacy `@/lib/audit` — inserts audit_log + patient_timeline when wired.
 */
export type IntakeAuditEntity = "patient" | "intake_document" | "protocol" | "token";

export type IntakeAuditInput = {
  tenantId: string;
  actorId: string | null;
  action: string;
  entity: IntakeAuditEntity;
  entityId?: string;
  payload?: Record<string, unknown>;
};

export async function writeAudit(input: IntakeAuditInput): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Intake writeAudit stub is not available in production");
  }

  void input;
  // Phase 0: no-op in development until Phase 1 DB wiring.
}
