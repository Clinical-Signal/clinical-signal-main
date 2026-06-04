/**
 * Intake module audit writer stub (PRD Phase 0.6 / C-AUDIT).
 * Phase 1+: insert audit_log + paired patient_timeline when entity === 'patient'.
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
}
