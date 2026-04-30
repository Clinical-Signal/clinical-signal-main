-- Migration 0009: Protocol outputs (derivative documents)
--
-- When a practitioner approves a protocol, the system auto-generates three
-- derivative outputs:
--   1. client_doc — patient-friendly phased action plan
--   2. call_deck — 5-7 slide content blocks for the practitioner-patient call
--   3. follow_up_email — warm professional email summarizing the plan
--
-- Each output is stored as a row here, linked to its source protocol.

BEGIN;

CREATE TABLE protocol_outputs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  protocol_id   UUID NOT NULL REFERENCES protocols(id),
  patient_id    UUID NOT NULL REFERENCES patients(id),

  -- What type of derivative output
  output_type   TEXT NOT NULL CHECK (output_type IN ('client_doc', 'call_deck', 'follow_up_email')),

  -- The generated content
  content       JSONB NOT NULL DEFAULT '{}',

  -- AI generation metadata
  model_id      TEXT,
  prompt_version TEXT,
  token_usage   JSONB DEFAULT '{}',

  -- Status tracking
  status        TEXT NOT NULL DEFAULT 'generating'
                CHECK (status IN ('generating', 'complete', 'failed', 'regenerating')),
  error_message TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary lookup: all outputs for a protocol
CREATE INDEX idx_protocol_outputs_protocol
  ON protocol_outputs (protocol_id, output_type);

-- Tenant isolation
CREATE INDEX idx_protocol_outputs_tenant
  ON protocol_outputs (tenant_id);

-- RLS
ALTER TABLE protocol_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_outputs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON protocol_outputs
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- One output per type per protocol (regeneration overwrites via status update)
CREATE UNIQUE INDEX idx_protocol_outputs_unique_type
  ON protocol_outputs (protocol_id, output_type)
  WHERE status IN ('generating', 'complete');

COMMIT;
