-- 0011_protocol_edits.sql
-- Track practitioner edits to AI-generated protocols.
-- Each row captures a structured diff between the original AI output
-- and the practitioner-approved version, enabling pattern recognition
-- and learning over time.

BEGIN;

CREATE TABLE IF NOT EXISTS protocol_edits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  protocol_id   UUID NOT NULL REFERENCES protocols(id),
  patient_id    UUID NOT NULL,
  practitioner_id UUID NOT NULL,

  -- What changed
  edit_type     TEXT NOT NULL CHECK (edit_type IN (
    'supplement_added',
    'supplement_removed',
    'supplement_dosage_changed',
    'supplement_timing_changed',
    'supplement_replaced',
    'dietary_added',
    'dietary_removed',
    'dietary_modified',
    'lifestyle_added',
    'lifestyle_removed',
    'lifestyle_modified',
    'layer_reordered',
    'layer_added',
    'layer_removed',
    'language_rewritten',
    'clinical_reasoning_edited',
    'other'
  )),

  -- Structured detail about the edit
  original_value  JSONB,      -- what the AI generated
  edited_value    JSONB,      -- what the practitioner changed it to
  section         TEXT,        -- where in the protocol (e.g. 'supplement_protocol', 'daily_protocol.morning', 'layer_2')
  summary         TEXT NOT NULL, -- human-readable summary (e.g. 'Added NAC 600mg to Layer 1 morning')

  -- Full protocol snapshots for deeper analysis
  original_clinical  JSONB,   -- full original clinical_content (stored once per protocol, null on subsequent rows)
  original_client    JSONB,   -- full original client_content

  -- Metadata
  confidence      NUMERIC(3,2) DEFAULT 1.0, -- how confident the diff algorithm is (1.0 = exact match, lower = fuzzy)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying a practitioner's edit patterns
CREATE INDEX idx_protocol_edits_practitioner
  ON protocol_edits (practitioner_id, edit_type, created_at DESC);

-- Index for querying edits for a specific protocol
CREATE INDEX idx_protocol_edits_protocol
  ON protocol_edits (protocol_id);

-- RLS
ALTER TABLE protocol_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_edits FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON protocol_edits
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Suggested preferences table: AI-detected patterns surfaced as suggestions
CREATE TABLE IF NOT EXISTS suggested_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  practitioner_id UUID NOT NULL,

  -- The suggestion
  category        TEXT NOT NULL CHECK (category IN (
    'protocol_structure', 'supplements', 'communication_style',
    'branding', 'clinical', 'general'
  )),
  suggested_rule  TEXT NOT NULL,       -- the preference text to add
  label           TEXT,                -- short name
  reasoning       TEXT NOT NULL,       -- why the system thinks this (e.g. 'You added NAC to 4 of your last 5 gut protocols')
  supporting_edits UUID[] NOT NULL,    -- references to protocol_edits rows that support this

  -- Status
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- shown to practitioner, not yet acted on
    'accepted',     -- practitioner accepted → became a preference
    'dismissed',    -- practitioner dismissed
    'auto_applied'  -- system auto-applied after high confidence
  )),
  preference_id   UUID REFERENCES practitioner_preferences(id), -- if accepted, links to the created preference

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_suggested_prefs_practitioner
  ON suggested_preferences (practitioner_id, status, created_at DESC);

ALTER TABLE suggested_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggested_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON suggested_preferences
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

COMMIT;
