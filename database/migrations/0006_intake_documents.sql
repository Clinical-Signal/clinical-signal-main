-- 0006_intake_documents.sql — dynamic intake: documents + chunks (sprint-5).

\connect clinical_signal

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS intake_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL
    CHECK (doc_type IN ('transcript','pdf','docx','txt','image','video','audio','note')),
  original_filename TEXT,
  blob_url TEXT,
  file_size_bytes INTEGER,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processing','complete','failed')),
  processing_error TEXT,
  extracted_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES practitioners(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS intake_docs_patient_idx ON intake_documents(patient_id);
CREATE INDEX IF NOT EXISTS intake_docs_tenant_idx ON intake_documents(tenant_id);

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES intake_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text_content TEXT NOT NULL,
  token_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS doc_chunks_doc_idx ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS doc_chunks_tenant_idx ON document_chunks(tenant_id);

-- RLS
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['intake_documents','document_chunks']) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      DROP POLICY IF EXISTS tenant_isolation ON %1$I;
      CREATE POLICY tenant_isolation ON %1$I
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
    $p$, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON intake_documents, document_chunks TO app_user;
