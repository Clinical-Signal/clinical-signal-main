// PatientTimeline write helpers. The patient_timeline table (migration 0007)
// is append-only: every meaningful interaction becomes a timestamped event.
// These helpers are called from server actions and API routes to record events.

import { withTenant } from "./db";

type TimelineEventType =
  | "intake_started"
  | "intake_section_completed"
  | "intake_submitted"
  | "intake_reviewed"
  | "document_uploaded"
  | "document_processed"
  | "document_failed"
  | "lab_results_extracted"
  | "lab_results_reviewed"
  | "lab_results_corrected"
  | "call_transcript_added"
  | "practitioner_note_added"
  | "practitioner_observation"
  | "protocol_generated"
  | "protocol_edited"
  | "protocol_approved"
  | "protocol_superseded"
  | "client_doc_generated"
  | "call_deck_generated"
  | "phase_started"
  | "phase_completed"
  | "checklist_assigned"
  | "checklist_completed"
  | "outcome_recorded"
  | "follow_up_scheduled"
  | "ai_follow_up_generated"
  | "lab_suggestion_generated";

type ActorType = "practitioner" | "patient" | "system" | "ai";

export interface TimelineEventInput {
  tenantId: string;
  patientId: string;
  eventType: TimelineEventType;
  eventAt?: Date;
  actorId?: string | null;
  actorType?: ActorType;
  eventData?: Record<string, unknown>;
  recordId?: string | null;
  protocolId?: string | null;
  documentId?: string | null;
  summary?: string | null;
  aiContext?: string | null;
  source?: "app" | "import" | "migration" | "api";
}

export async function writeTimelineEvent(input: TimelineEventInput): Promise<string> {
  const eventAt = input.eventAt ?? new Date();
  return withTenant(input.tenantId, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO patient_timeline
         (tenant_id, patient_id, event_type, event_at, actor_id, actor_type,
          event_data, record_id, protocol_id, document_id, summary, ai_context, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        input.tenantId,
        input.patientId,
        input.eventType,
        eventAt,
        input.actorId ?? null,
        input.actorType ?? "practitioner",
        JSON.stringify(input.eventData ?? {}),
        input.recordId ?? null,
        input.protocolId ?? null,
        input.documentId ?? null,
        input.summary ?? null,
        input.aiContext ?? null,
        input.source ?? "app",
      ],
    );
    return rows[0]!.id;
  });
}

// Convenience: record intake section save
export async function recordIntakeSectionCompleted(
  tenantId: string,
  patientId: string,
  section: string,
  practitionerId: string,
): Promise<void> {
  await writeTimelineEvent({
    tenantId,
    patientId,
    eventType: "intake_section_completed",
    actorId: practitionerId,
    actorType: "practitioner",
    eventData: { section },
    summary: `Intake section "${section}" saved`,
  });
}

// Convenience: record intake submission
export async function recordIntakeSubmitted(
  tenantId: string,
  patientId: string,
  practitionerId: string,
): Promise<void> {
  await writeTimelineEvent({
    tenantId,
    patientId,
    eventType: "intake_submitted",
    actorId: practitionerId,
    actorType: "practitioner",
    summary: "Full intake form submitted",
  });
}

// Convenience: record protocol generated
export async function recordProtocolGenerated(
  tenantId: string,
  patientId: string,
  protocolId: string,
  practitionerId: string,
  title: string,
): Promise<void> {
  await writeTimelineEvent({
    tenantId,
    patientId,
    eventType: "protocol_generated",
    actorId: practitionerId,
    actorType: "ai",
    protocolId,
    eventData: { title },
    summary: `Protocol draft generated: ${title}`,
  });
}

// Convenience: record protocol approved
export async function recordProtocolApproved(
  tenantId: string,
  patientId: string,
  protocolId: string,
  practitionerId: string,
): Promise<void> {
  await writeTimelineEvent({
    tenantId,
    patientId,
    eventType: "protocol_approved",
    actorId: practitionerId,
    actorType: "practitioner",
    protocolId,
    summary: "Protocol approved by practitioner",
  });
}

// Convenience: record derivative output generated
export async function recordDerivativeGenerated(
  tenantId: string,
  patientId: string,
  protocolId: string,
  outputType: "client_doc" | "call_deck",
): Promise<void> {
  const eventType = outputType === "client_doc" ? "client_doc_generated" : "call_deck_generated";
  await writeTimelineEvent({
    tenantId,
    patientId,
    eventType,
    actorType: "ai",
    protocolId,
    summary: `${outputType === "client_doc" ? "Client document" : "Call deck"} auto-generated from approved protocol`,
  });
}
