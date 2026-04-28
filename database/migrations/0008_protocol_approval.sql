-- Migration: Protocol approval workflow
-- Adds 'approved' and 'superseded' statuses to protocols.
-- When a protocol is approved, all prior versions for that patient
-- are automatically marked 'superseded'.

-- 1. Widen the status CHECK constraint
ALTER TABLE protocols DROP CONSTRAINT IF EXISTS protocols_status_check;
ALTER TABLE protocols ADD CONSTRAINT protocols_status_check
  CHECK (status IN ('draft', 'review', 'finalized', 'approved', 'superseded'));

-- 2. Add approved_at timestamp (like finalized_at)
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- 3. Index for quickly finding the approved protocol per patient
CREATE INDEX IF NOT EXISTS protocols_patient_status_idx
  ON protocols(patient_id, status)
  WHERE status = 'approved';
