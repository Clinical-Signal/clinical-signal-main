-- 0005_protocol_export.sql — allow records.record_type = 'protocol_export'
-- so the PDF exporter can write a row pointing at the generated file
-- (issue #12 / Sprint 4).

\connect clinical_signal

ALTER TABLE records DROP CONSTRAINT IF EXISTS records_record_type_check;
ALTER TABLE records
  ADD CONSTRAINT records_record_type_check
  CHECK (record_type IN (
    'lab','clinical_note','imaging','intake_form','protocol_export','other'
  ));
