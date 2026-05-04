-- 0016_knowledge_orchestrator.sql
-- Knowledge Orchestrator schema: multi-leader sourcing, domain tagging,
-- conflict tracking, and Dr. Laura's review workflow.
--
-- Adds 5 new tables and extends clinical_knowledge with provenance columns.
-- All changes are additive — existing data and queries are unaffected.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. knowledge_leaders — trusted source authorities
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS knowledge_leaders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  credentials     TEXT,
  specialties     TEXT[] DEFAULT '{}',
  authority_domains TEXT[] DEFAULT '{}',
  website_url     TEXT,
  notes           TEXT,
  is_internal     BOOLEAN DEFAULT false,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS knowledge_leaders_tenant_idx
  ON knowledge_leaders(tenant_id);

-- ---------------------------------------------------------------------------
-- 2. knowledge_sources — individual content pieces (books, episodes, etc.)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  leader_id       UUID REFERENCES knowledge_leaders(id) ON DELETE SET NULL,
  source_type     TEXT NOT NULL CHECK (source_type IN (
    'book', 'podcast_episode', 'youtube_video', 'article', 'blog_post',
    'course_module', 'training_recording', 'clinical_case', 'slack_thread',
    'research_paper', 'protocol_template', 'other'
  )),
  title           TEXT NOT NULL,
  url             TEXT,
  published_date  DATE,
  ingestion_status TEXT NOT NULL DEFAULT 'queued' CHECK (ingestion_status IN (
    'queued', 'ingesting', 'extracted', 'reviewed', 'rejected'
  )),
  ingested_at     TIMESTAMPTZ,
  entry_count     INT DEFAULT 0,
  raw_text        TEXT,
  raw_text_hash   TEXT,
  file_path       TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, raw_text_hash)
);

CREATE INDEX IF NOT EXISTS knowledge_sources_tenant_idx
  ON knowledge_sources(tenant_id);
CREATE INDEX IF NOT EXISTS knowledge_sources_leader_idx
  ON knowledge_sources(leader_id);
CREATE INDEX IF NOT EXISTS knowledge_sources_status_idx
  ON knowledge_sources(ingestion_status);

-- ---------------------------------------------------------------------------
-- 3. knowledge_domains — the 6 knowledge domains (reference table)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS knowledge_domains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  sort_order      INT NOT NULL DEFAULT 0,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- ---------------------------------------------------------------------------
-- 4. Extend clinical_knowledge with provenance columns
-- ---------------------------------------------------------------------------

ALTER TABLE clinical_knowledge
  ADD COLUMN IF NOT EXISTS leader_id UUID REFERENCES knowledge_leaders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS domains TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed', 'pending_review', 'approved', 'corrected', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2) DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS corroboration_count INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS clinical_knowledge_leader_idx
  ON clinical_knowledge(leader_id);
CREATE INDEX IF NOT EXISTS clinical_knowledge_source_idx
  ON clinical_knowledge(source_id);
CREATE INDEX IF NOT EXISTS clinical_knowledge_review_idx
  ON clinical_knowledge(review_status);
CREATE INDEX IF NOT EXISTS clinical_knowledge_domains_idx
  ON clinical_knowledge USING GIN (domains);
CREATE INDEX IF NOT EXISTS clinical_knowledge_confidence_idx
  ON clinical_knowledge(confidence_score DESC);

-- ---------------------------------------------------------------------------
-- 5. knowledge_conflicts — when leaders disagree
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS knowledge_conflicts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  topic           TEXT NOT NULL,
  domains         TEXT[] DEFAULT '{}',
  systems_involved TEXT[] DEFAULT '{}',
  positions       JSONB NOT NULL,
  resolution_type TEXT DEFAULT 'unresolved' CHECK (resolution_type IN (
    'unresolved', 'context_dependent', 'leader_preferred',
    'dr_laura_override', 'consensus'
  )),
  resolution_text TEXT,
  resolution_context JSONB,
  resolved_by     UUID,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_conflicts_tenant_idx
  ON knowledge_conflicts(tenant_id);
CREATE INDEX IF NOT EXISTS knowledge_conflicts_domains_idx
  ON knowledge_conflicts USING GIN (domains);
CREATE INDEX IF NOT EXISTS knowledge_conflicts_systems_idx
  ON knowledge_conflicts USING GIN (systems_involved);
CREATE INDEX IF NOT EXISTS knowledge_conflicts_resolution_idx
  ON knowledge_conflicts(resolution_type);

-- ---------------------------------------------------------------------------
-- 6. knowledge_review_queue — Dr. Laura's review workflow
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS knowledge_review_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  review_type     TEXT NOT NULL CHECK (review_type IN (
    'new_entries', 'conflict', 'low_confidence',
    'correction_needed', 'periodic_audit'
  )),
  entry_ids       UUID[] DEFAULT '{}',
  conflict_id     UUID REFERENCES knowledge_conflicts(id),
  source_id       UUID REFERENCES knowledge_sources(id),
  brief_title     TEXT NOT NULL,
  brief_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_review', 'completed', 'skipped'
  )),
  assigned_to     UUID,
  responses       JSONB,
  notes           TEXT,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_review_queue_tenant_idx
  ON knowledge_review_queue(tenant_id);
CREATE INDEX IF NOT EXISTS knowledge_review_queue_status_idx
  ON knowledge_review_queue(status)
  WHERE status IN ('pending', 'in_review');

-- ---------------------------------------------------------------------------
-- RLS — same pattern as 0004_knowledge_graph.sql
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'knowledge_leaders', 'knowledge_sources', 'knowledge_domains',
    'knowledge_conflicts', 'knowledge_review_queue'
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

-- Grant app role access
GRANT SELECT, INSERT, UPDATE, DELETE ON
  knowledge_leaders, knowledge_sources, knowledge_domains,
  knowledge_conflicts, knowledge_review_queue
TO app_user;

-- ---------------------------------------------------------------------------
-- Seed: 6 knowledge domains
-- ---------------------------------------------------------------------------
-- Note: tenant_id must be set via current_setting before running seeds,
-- or these can be inserted via the app. Leaving as reference SQL:
--
-- INSERT INTO knowledge_domains (tenant_id, slug, name, description, sort_order) VALUES
--   (current_setting('app.current_tenant_id')::uuid, 'pattern_recognition', 'Pattern Recognition', 'Lab pattern + symptom combos → likely root cause', 1),
--   (current_setting('app.current_tenant_id')::uuid, 'clinical_sequencing', 'Clinical Sequencing', 'Order of operations — what to address first and why', 2),
--   (current_setting('app.current_tenant_id')::uuid, 'dynamic_supplementation', 'Dynamic Supplementation', 'Dosing adjusted for age, weight, gender, genetics', 3),
--   (current_setting('app.current_tenant_id')::uuid, 'delivery_method_intelligence', 'Delivery Method Intelligence', 'Liposomal vs capsule vs sublingual matched to supplement + patient absorption', 4),
--   (current_setting('app.current_tenant_id')::uuid, 'prerequisite_mapping', 'Prerequisite Mapping', 'This protocol won''t work until X is fixed first', 5),
--   (current_setting('app.current_tenant_id')::uuid, 'focused_lifestyle_coaching', 'Focused Lifestyle Coaching', '1-3 highest-impact changes per phase, not generic lists', 6);

COMMIT;
