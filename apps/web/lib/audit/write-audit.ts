/**
 * Intake module audit writer (C-AUDIT). PHI-free payloads only.
 * Paired patient_timeline rows for patient-scoped intake events.
 */
import { withSystem } from "@cs/db";

import { writeTimelineEvent } from "@/lib/timeline";

export type IntakeAuditEntity = "patient" | "intake_document" | "protocol" | "token";

export type IntakeAuditInput = {
  tenantId: string;
  actorId: string | null;
  action: string;
  entity: IntakeAuditEntity;
  entityId?: string;
  payload?: Record<string, unknown>;
};

function nullableUuid(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") {
    return null;
  }
  return value;
}

async function insertAuditRow(input: IntakeAuditInput): Promise<void> {
  await withSystem({ reason: "intake_audit_log_write" }, async (client) => {
    await client.query(
      `INSERT INTO audit_log
         (tenant_id, practitioner_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        nullableUuid(input.tenantId),
        nullableUuid(input.actorId),
        input.action,
        input.entity,
        nullableUuid(input.entityId),
        JSON.stringify(input.payload ?? {}),
      ],
    );
  });
}

async function maybeWriteTimeline(input: IntakeAuditInput): Promise<void> {
  if (input.entity !== "patient" || !input.entityId) {
    return;
  }

  if (input.action === "intake_submitted") {
    await writeTimelineEvent({
      tenantId: input.tenantId,
      patientId: input.entityId,
      eventType: "intake_submitted",
      actorId: input.actorId,
      actorType: input.actorId ? "practitioner" : "patient",
      eventData: input.payload,
      summary: "Patient submitted intake",
      source: "app",
    });
    return;
  }

  if (input.action === "intake_section_saved") {
    await writeTimelineEvent({
      tenantId: input.tenantId,
      patientId: input.entityId,
      eventType: "intake_section_completed",
      actorId: input.actorId,
      actorType: input.actorId ? "practitioner" : "patient",
      eventData: input.payload,
      summary: "Intake section saved",
      source: "app",
    });
  }
}

export async function writeAudit(input: IntakeAuditInput): Promise<void> {
  await insertAuditRow(input);
  await maybeWriteTimeline(input);
}
