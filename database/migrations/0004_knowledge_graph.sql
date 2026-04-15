-- 0004_knowledge_graph.sql — clinical knowledge base + graph (issue #10).
--
-- Stores Dr. Laura DeCesaris's mentorship knowledge as:
--   * clinical_knowledge — free-form clinical items, vector-indexed
--   * clinical_concepts  — unique typed concepts (symptom, lab marker, etc.)
--   * clinical_relationships — typed edges between concepts
--   * patient_embeddings — reserved for future per-patient semantic search
--
-- Embedding dimension is 384 (sentence-transformers/all-MiniLM-L6-v2).
-- The extraction pipeline lives in services/analysis-engine/scripts/.

\connect clinical_signal

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- clinical_knowledge
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL
    CHECK (category IN (
      'protocol_pattern','supplement_protocol','lab_interpretation',
      'clinical_sequencing','dietary_recommendation','lifestyle_intervention',
      'other'
    )),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(384),
  -- metadata holds the structured fields from knowledge_extraction_v1:
  -- conditions, symptoms, lab_markers, supplements, sequencing_notes,
  -- contraindications, clinical_reasoning.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_channel TEXT,
  -- sha256 of the source chunk text; lets ingestion be idempotent per chunk.
  source_chunk_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_chunk_hash, title)
);
CREATE INDEX IF NOT EXISTS clinical_knowledge_tenant_idx
  ON clinical_knowledge(tenant_id);
CREATE INDEX IF NOT EXISTS clinical_knowledge_category_idx
  ON clinical_knowledge(category);
CREATE INDEX IF NOT EXISTS clinical_knowledge_channel_idx
  ON clinical_knowledge(source_channel);
-- ivfflat cosine index for semantic search. Built with a conservative list
-- count; the dataset is small (thousands of rows) so lists=50 is fine.
CREATE INDEX IF NOT EXISTS clinical_knowledge_embedding_idx
  ON clinical_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ---------------------------------------------------------------------------
-- clinical_concepts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  concept_type TEXT NOT NULL
    CHECK (concept_type IN (
      'symptom','condition','lab_marker','supplement',
      'intervention','body_system','dietary_pattern','other'
    )),
  -- Canonical lowercase name; UI can re-title. Unique per (tenant,type) so
  -- "cortisol" as lab_marker and as intervention are distinct rows if ever
  -- needed.
  name TEXT NOT NULL,
  description TEXT,
  embedding vector(384),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, concept_type, name)
);
CREATE INDEX IF NOT EXISTS clinical_concepts_tenant_idx
  ON clinical_concepts(tenant_id);
CREATE INDEX IF NOT EXISTS clinical_concepts_type_idx
  ON clinical_concepts(concept_type);
CREATE INDEX IF NOT EXISTS clinical_concepts_name_idx
  ON clinical_concepts(lower(name));

-- ---------------------------------------------------------------------------
-- clinical_relationships
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_concept_id UUID NOT NULL REFERENCES clinical_concepts(id) ON DELETE CASCADE,
  target_concept_id UUID NOT NULL REFERENCES clinical_concepts(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL
    CHECK (relationship_type IN (
      'causes','indicates','treats','precedes','contraindicates',
      'part_of','correlates_with','worsens','improves','requires'
    )),
  -- 0..1 confidence / qualitative strength; assigned by the extraction LLM.
  strength DOUBLE PRECISION CHECK (strength IS NULL OR (strength >= 0 AND strength <= 1)),
  evidence TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_concept_id, target_concept_id, relationship_type),
  CHECK (source_concept_id <> target_concept_id)
);
CREATE INDEX IF NOT EXISTS clinical_relationships_tenant_idx
  ON clinical_relationships(tenant_id);
CREATE INDEX IF NOT EXISTS clinical_relationships_source_idx
  ON clinical_relationships(source_concept_id);
CREATE INDEX IF NOT EXISTS clinical_relationships_target_idx
  ON clinical_relationships(target_concept_id);
CREATE INDEX IF NOT EXISTS clinical_relationships_type_idx
  ON clinical_relationships(relationship_type);

-- ---------------------------------------------------------------------------
-- patient_embeddings (reserved for future per-patient semantic search)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  -- Short label describing what this embedding represents ('intake_summary',
  -- 'timeline_summary', etc.). Lets us add views without migration churn.
  kind TEXT NOT NULL,
  embedding vector(384) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patient_id, kind, model_id)
);
CREATE INDEX IF NOT EXISTS patient_embeddings_tenant_idx
  ON patient_embeddings(tenant_id);
CREATE INDEX IF NOT EXISTS patient_embeddings_patient_idx
  ON patient_embeddings(patient_id);
CREATE INDEX IF NOT EXISTS patient_embeddings_vec_idx
  ON patient_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ---------------------------------------------------------------------------
-- RLS (mirrors 0002_core_schema.sql pattern)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'clinical_knowledge','clinical_concepts','clinical_relationships',
    'patient_embeddings'
  ]) LOOP
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

-- Grant the app role access to the new tables (mirrors 0002).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  clinical_knowledge, clinical_concepts, clinical_relationships, patient_embeddings
TO app_user;
