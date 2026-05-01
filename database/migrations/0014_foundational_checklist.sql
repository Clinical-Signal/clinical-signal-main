-- Migration 0014: Foundational Checklist
-- Issue: Sprint 5 — Foundational checklist for lab waiting period
--
-- During the 1-3 week lab waiting period, practitioners assign foundational
-- work (sleep hygiene, nutrition basics, stress management, movement, etc.)
-- so patients aren't just sitting idle. This table stores the assigned plan.

BEGIN;

-- ============================================================
-- Extend records.record_type to include 'foundational_plan'
-- ============================================================
ALTER TABLE records DROP CONSTRAINT IF EXISTS records_record_type_check;
ALTER TABLE records
  ADD CONSTRAINT records_record_type_check
  CHECK (record_type IN (
    'lab','clinical_note','imaging','intake_form','protocol_export',
    'foundational_plan','other'
  ));

-- ============================================================
-- TABLE: foundational_plans
-- ============================================================
-- One plan per patient (upserts replace prior plan).
-- Items stored as JSONB array for flexibility.
CREATE TABLE foundational_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  patient_id    UUID NOT NULL REFERENCES patients(id),

  -- The plan content — array of checklist items
  -- Each item: { id, topic, title, description, resources?, completed }
  items         JSONB NOT NULL DEFAULT '[]',

  -- Practitioner notes for the patient
  practitioner_notes TEXT,

  -- Tracking
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by   UUID NOT NULL REFERENCES practitioners(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Only one active plan per patient per tenant
  UNIQUE (tenant_id, patient_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_foundational_plans_patient
  ON foundational_plans (tenant_id, patient_id);

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
ALTER TABLE foundational_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE foundational_plans FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON foundational_plans
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

COMMIT;
