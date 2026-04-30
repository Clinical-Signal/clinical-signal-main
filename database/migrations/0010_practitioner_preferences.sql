-- Migration 0010: Practitioner preferences (protocol playbook)
--
-- Each practitioner can store free-text rules that shape how the AI
-- generates protocols and derivative outputs. Examples:
--   "Structure protocols as 4-week blocks"
--   "Never recommend more than 5 supplements per phase"
--   "Sign off emails as 'In health, Dr. Laura'"
--
-- Rules are injected into AI prompts at generation time so the output
-- automatically matches the practitioner's preferred style and structure.

BEGIN;

CREATE TABLE practitioner_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  practitioner_id UUID NOT NULL REFERENCES practitioners(id),

  -- Categorize the rule for organization and selective injection
  category        TEXT NOT NULL DEFAULT 'general'
                  CHECK (category IN (
                    'protocol_structure',   -- phasing, block length, sequencing rules
                    'supplements',          -- brand preferences, max counts, exclusions
                    'communication_style',  -- tone, formality, sign-off, phrases
                    'branding',             -- practice name, contact info, disclaimers
                    'clinical',             -- clinical decision rules, always/never include
                    'general'               -- anything else
                  )),

  -- The rule itself — free text, written in the practitioner's own words
  rule_text       TEXT NOT NULL,

  -- Optional short label for display (auto-generated if blank)
  label           TEXT,

  -- Is this rule active? Allows toggling without deleting
  active          BOOLEAN NOT NULL DEFAULT true,

  -- Ordering for display
  sort_order      INTEGER NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary query: all active rules for a practitioner
CREATE INDEX idx_pref_practitioner_active
  ON practitioner_preferences (practitioner_id, active)
  WHERE active = true;

-- Tenant isolation
CREATE INDEX idx_pref_tenant
  ON practitioner_preferences (tenant_id);

ALTER TABLE practitioner_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE practitioner_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON practitioner_preferences
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

COMMIT;
