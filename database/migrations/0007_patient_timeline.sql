-- Migration 0007: PatientTimeline — Core append-only event log
-- Issue #93 / #94
--
-- This is the backbone of Clinical Signal's data model. Every meaningful
-- interaction with a patient becomes a timestamped event in this table.
-- When the AI generates a protocol, it reads this timeline to understand
-- the patient's full journey — intake answers, lab results, call notes,
-- previous protocols, outcomes, and practitioner observations.
--
-- Design principles:
--   1. Append-only: events are never updated or deleted (HIPAA audit trail)
--   2. Chronological: event_at is when it happened clinically, not when it was recorded
--   3. Self-contained: event_data JSONB holds everything needed to understand the event
--   4. Linkable: optional foreign keys connect events to their source records

BEGIN;

-- ============================================================
-- ENUM: All event types the system can record
-- ============================================================
CREATE TYPE timeline_event_type AS ENUM (
  -- Intake flow
  'intake_started',          -- patient began filling out intake form
  'intake_section_completed',-- one section of multi-step intake finished
  'intake_submitted',        -- full intake form submitted
  'intake_reviewed',         -- practitioner reviewed the intake

  -- Documents
  'document_uploaded',       -- any document uploaded (lab PDF, transcript, etc.)
  'document_processed',      -- document text extracted and structured
  'document_failed',         -- document processing failed

  -- Labs
  'lab_results_extracted',   -- structured lab values parsed from PDF
  'lab_results_reviewed',    -- practitioner reviewed extracted lab values
  'lab_results_corrected',   -- practitioner corrected an extracted value

  -- Calls and notes
  'call_transcript_added',   -- call transcript uploaded or pasted
  'practitioner_note_added', -- free-text note from practitioner
  'practitioner_observation',-- clinical observation (e.g., "patient reports improvement")

  -- Protocol lifecycle
  'protocol_generated',      -- AI produced a clinical protocol draft
  'protocol_edited',         -- practitioner edited the protocol
  'protocol_approved',       -- practitioner approved → triggers client doc + call deck
  'protocol_superseded',     -- older protocol replaced by new approved one
  'client_doc_generated',    -- client-facing action plan auto-generated
  'call_deck_generated',     -- call slide deck auto-generated

  -- Patient journey
  'phase_started',           -- patient moved to a new protocol phase
  'phase_completed',         -- patient completed a protocol phase
  'checklist_assigned',      -- foundational checklist assigned during lab wait
  'checklist_completed',     -- patient completed a checklist item
  'outcome_recorded',        -- patient self-reported outcome or progress
  'follow_up_scheduled',     -- next appointment or check-in scheduled

  -- System
  'ai_follow_up_generated',  -- AI generated follow-up questions based on intake
  'lab_suggestion_generated' -- AI suggested which labs to order based on intake
);

-- ============================================================
-- TABLE: patient_timeline
-- ============================================================
CREATE TABLE patient_timeline (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  patient_id    UUID NOT NULL REFERENCES patients(id),

  -- What happened
  event_type    timeline_event_type NOT NULL,
  event_at      TIMESTAMPTZ NOT NULL,  -- when it clinically happened
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),  -- when we logged it

  -- Who did it (null for system-generated events)
  actor_id      UUID REFERENCES practitioners(id),
  actor_type    TEXT NOT NULL DEFAULT 'practitioner'
                CHECK (actor_type IN ('practitioner', 'patient', 'system', 'ai')),

  -- Event payload — structure varies by event_type
  event_data    JSONB NOT NULL DEFAULT '{}',

  -- Optional links to source records
  record_id     UUID REFERENCES records(id),       -- linked lab/document if applicable
  protocol_id   UUID REFERENCES protocols(id),     -- linked protocol if applicable
  document_id   UUID REFERENCES intake_documents(id), -- linked intake doc if applicable

  -- Context for AI consumption
  summary       TEXT,  -- human-readable one-liner for timeline display
  ai_context    TEXT,  -- longer narrative for AI prompt inclusion

  -- Metadata
  source        TEXT NOT NULL DEFAULT 'app'
                CHECK (source IN ('app', 'import', 'migration', 'api')),
  version       INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Primary query pattern: "give me everything for this patient, in order"
CREATE INDEX idx_timeline_patient_chronological
  ON patient_timeline (tenant_id, patient_id, event_at DESC);

-- Filter by event type (e.g., "all protocol events for this patient")
CREATE INDEX idx_timeline_patient_event_type
  ON patient_timeline (tenant_id, patient_id, event_type, event_at DESC);

-- "What happened today across all my patients?"
CREATE INDEX idx_timeline_tenant_recent
  ON patient_timeline (tenant_id, recorded_at DESC);

-- Link lookups
CREATE INDEX idx_timeline_record ON patient_timeline (record_id) WHERE record_id IS NOT NULL;
CREATE INDEX idx_timeline_protocol ON patient_timeline (protocol_id) WHERE protocol_id IS NOT NULL;
CREATE INDEX idx_timeline_document ON patient_timeline (document_id) WHERE document_id IS NOT NULL;

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
ALTER TABLE patient_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_timeline FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON patient_timeline
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- ============================================================
-- HELPER VIEW: Latest event per patient (for dashboard status)
-- ============================================================
CREATE VIEW patient_latest_activity AS
SELECT DISTINCT ON (tenant_id, patient_id)
  tenant_id,
  patient_id,
  event_type AS last_event_type,
  event_at AS last_event_at,
  summary AS last_event_summary
FROM patient_timeline
ORDER BY tenant_id, patient_id, event_at DESC;

COMMIT;
