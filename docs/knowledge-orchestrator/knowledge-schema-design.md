# Knowledge Orchestrator — Schema Design

**Purpose:** Extend the existing Clinical Signal knowledge schema to support multi-leader sourcing, domain tagging, conflict tracking, and Dr. Laura's review workflow. Designed to run entirely in Neon PostgreSQL (pgvector for embeddings, relational for everything else).

**Last updated:** 2026-05-03

---

## Existing Schema (What We Have)

These tables already exist from migrations 0004 and 0013:

| Table | Purpose | Status |
|-------|---------|--------|
| `clinical_knowledge` | Free-form knowledge entries with vector embeddings (384d) | In use — 1,405 Slack-extracted entries |
| `clinical_concepts` | Typed concepts (symptom, lab_marker, supplement, etc.) | In use |
| `clinical_relationships` | Typed edges between concepts (causes, treats, precedes, etc.) | In use |
| `clinical_dialogues` | Practitioner Q&A pairs from protocol generation | In use |
| `practitioner_knowledge` | Distilled insights from dialogue answers | In use |
| `patient_embeddings` | Per-patient semantic search (reserved) | Empty |

## What's Missing

The existing schema was built for Dr. Laura's Slack data — single source, single voice. The Knowledge Orchestrator needs:

1. **Leader provenance** — who said what, from which source
2. **Content source registry** — track books, podcasts, articles as discrete sources
3. **Domain tagging** — the 6 knowledge domains as a first-class concept
4. **Conflict tracking** — when leaders disagree, capture both positions and resolution context
5. **Review workflow** — Dr. Laura's review status, approval, and corrections
6. **Confidence scoring** — multi-factor confidence (source authority, corroboration count, recency, Dr. Laura's review)

---

## New Tables

### 1. `knowledge_leaders` — The trusted source authorities

```sql
CREATE TABLE knowledge_leaders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                  -- "Dr. Mark Hyman"
  slug            TEXT NOT NULL,                  -- "mark-hyman"
  credentials     TEXT,                           -- "MD, Cleveland Clinic, IFM"
  specialties     TEXT[] DEFAULT '{}',            -- ['metabolic_health', 'nutrition', 'functional_medicine']
  authority_domains TEXT[] DEFAULT '{}',          -- domains where this leader is a primary authority
  website_url     TEXT,
  notes           TEXT,                           -- any special handling notes
  is_internal     BOOLEAN DEFAULT false,          -- true for Dr. Laura (ground truth)
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
```

**Why this table:** Every knowledge entry needs provenance. When the protocol engine retrieves knowledge, it needs to know "Hyman says X, Cole says Y, Dr. Laura prefers X in this context." Without leader tracking, the knowledge base is just an undifferentiated blob.

### 2. `knowledge_sources` — Individual content pieces (books, episodes, articles)

```sql
CREATE TABLE knowledge_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  leader_id       UUID REFERENCES knowledge_leaders(id) ON DELETE SET NULL,
  
  -- Source identification
  source_type     TEXT NOT NULL CHECK (source_type IN (
    'book', 'podcast_episode', 'youtube_video', 'article', 'blog_post',
    'course_module', 'training_recording', 'clinical_case', 'slack_thread',
    'research_paper', 'protocol_template', 'other'
  )),
  title           TEXT NOT NULL,                  -- "Gut Feelings, Chapter 3"
  url             TEXT,                           -- link to source if available
  published_date  DATE,                           -- when the source was published
  
  -- Ingestion tracking
  ingestion_status TEXT NOT NULL DEFAULT 'queued' CHECK (ingestion_status IN (
    'queued', 'ingesting', 'extracted', 'reviewed', 'rejected'
  )),
  ingested_at     TIMESTAMPTZ,
  entry_count     INT DEFAULT 0,                  -- how many knowledge entries extracted
  
  -- Storage
  raw_text        TEXT,                           -- full extracted text (for re-processing)
  raw_text_hash   TEXT,                           -- sha256 for dedup
  file_path       TEXT,                           -- S3 path if applicable
  
  metadata        JSONB NOT NULL DEFAULT '{}',    -- source-specific metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, raw_text_hash)
);
```

**Why this table:** The ingestion pipeline needs to track what's been processed, what's queued, and how many entries each source produced. This also supports the "review brief" workflow — Dr. Laura can see which sources have been ingested and which need her review.

### 3. `knowledge_domains` — The 6 knowledge domains as a reference table

```sql
CREATE TABLE knowledge_domains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,                  -- 'pattern_recognition'
  name            TEXT NOT NULL,                  -- 'Pattern Recognition'
  description     TEXT NOT NULL,
  sort_order      INT NOT NULL DEFAULT 0,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- Seed data (the 6 domains from the Knowledge Orchestrator vision):
-- 1. pattern_recognition — lab pattern + symptom combos → likely root cause
-- 2. clinical_sequencing — order of operations (fix methylation before detox, gut before hormones)
-- 3. dynamic_supplementation — dosing adjusted for age/weight/gender/genetics
-- 4. delivery_method_intelligence — liposomal vs capsule vs sublingual matched to patient
-- 5. prerequisite_mapping — "this won't work until X is fixed first"
-- 6. focused_lifestyle_coaching — 1-3 highest-impact changes per phase
```

**Why a table instead of an enum:** Domains may evolve. Dr. Laura might identify a 7th domain. A reference table lets us add domains without a migration.

### 4. Extending `clinical_knowledge` — Add provenance columns

Rather than creating a parallel table, we add columns to the existing `clinical_knowledge` table:

```sql
-- New columns on clinical_knowledge
ALTER TABLE clinical_knowledge ADD COLUMN IF NOT EXISTS
  leader_id UUID REFERENCES knowledge_leaders(id) ON DELETE SET NULL;

ALTER TABLE clinical_knowledge ADD COLUMN IF NOT EXISTS
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL;

ALTER TABLE clinical_knowledge ADD COLUMN IF NOT EXISTS
  domains TEXT[] DEFAULT '{}';  -- e.g. ['clinical_sequencing', 'pattern_recognition']

ALTER TABLE clinical_knowledge ADD COLUMN IF NOT EXISTS
  review_status TEXT DEFAULT 'unreviewed' CHECK (review_status IN (
    'unreviewed',       -- fresh from ingestion
    'pending_review',   -- flagged for Dr. Laura
    'approved',         -- Dr. Laura confirmed
    'corrected',        -- Dr. Laura corrected (original preserved in metadata)
    'rejected'          -- Dr. Laura rejected
  ));

ALTER TABLE clinical_knowledge ADD COLUMN IF NOT EXISTS
  reviewed_by UUID;  -- practitioner_id of reviewer

ALTER TABLE clinical_knowledge ADD COLUMN IF NOT EXISTS
  reviewed_at TIMESTAMPTZ;

ALTER TABLE clinical_knowledge ADD COLUMN IF NOT EXISTS
  confidence_score NUMERIC(3,2) DEFAULT 0.5;
  -- Composite score: source_authority * corroboration * recency * review_bonus

ALTER TABLE clinical_knowledge ADD COLUMN IF NOT EXISTS
  corroboration_count INT DEFAULT 0;
  -- How many other leaders support this same claim
```

**Why extend instead of replace:** 1,405 entries already exist in this table. We don't want to migrate data. New columns are all nullable with defaults, so existing rows are unaffected.

### 5. `knowledge_conflicts` — When leaders disagree

```sql
CREATE TABLE knowledge_conflicts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- The topic of disagreement
  topic           TEXT NOT NULL,                  -- "Gut repair vs HPA axis: which comes first?"
  domains         TEXT[] DEFAULT '{}',            -- which domains this conflict spans
  systems_involved TEXT[] DEFAULT '{}',           -- body systems (gut, hpa_axis, thyroid, etc.)
  
  -- The positions
  positions       JSONB NOT NULL,
  -- Array of: {
  --   leader_id: uuid,
  --   leader_name: text,
  --   position: text,          -- "Address gut first because..."
  --   source_ids: uuid[],      -- which sources support this position
  --   entry_ids: uuid[],       -- linked clinical_knowledge entries
  -- }
  
  -- Resolution
  resolution_type TEXT CHECK (resolution_type IN (
    'unresolved',               -- not yet evaluated
    'context_dependent',        -- "depends on the patient" — the most common resolution
    'leader_preferred',         -- one leader's view is preferred in general
    'dr_laura_override',        -- Dr. Laura has a definitive position
    'consensus'                 -- leaders actually agree when context is clarified
  )) DEFAULT 'unresolved',
  
  resolution_text TEXT,         -- natural language resolution / decision tree
  resolution_context JSONB,     -- structured: when to use which approach
  -- e.g. { "if_gut_dominant": "gut_first", "if_fatigue_dominant": "hpa_first",
  --        "if_both": "simultaneous_gentle_protocol" }
  
  resolved_by     UUID,         -- practitioner_id
  resolved_at     TIMESTAMPTZ,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Why this table:** This is the heart of the Knowledge Orchestrator's value. Generic AI gives one answer. Clinical Signal says "Hyman recommends X, Cole recommends Y, and here's when each is right based on the patient's context." The `resolution_context` JSONB field is where decision trees live — these feed directly into protocol generation.

### 6. `knowledge_review_queue` — Dr. Laura's review workflow

```sql
CREATE TABLE knowledge_review_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- What needs review
  review_type     TEXT NOT NULL CHECK (review_type IN (
    'new_entries',       -- batch of new knowledge entries from ingestion
    'conflict',          -- a disagreement between leaders
    'low_confidence',    -- entry that the AI isn't sure about
    'correction_needed', -- entry that contradicts newer information
    'periodic_audit'     -- scheduled review of existing entries
  )),
  
  -- References (polymorphic)
  entry_ids       UUID[] DEFAULT '{}',         -- clinical_knowledge entries
  conflict_id     UUID REFERENCES knowledge_conflicts(id),
  source_id       UUID REFERENCES knowledge_sources(id),
  
  -- The review brief (AI-generated questions for Dr. Laura)
  brief_title     TEXT NOT NULL,
  brief_questions JSONB NOT NULL DEFAULT '[]',  -- array of { question, context, options? }
  
  -- Status
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_review', 'completed', 'skipped'
  )),
  assigned_to     UUID,           -- practitioner_id
  
  -- Dr. Laura's responses
  responses       JSONB,          -- her answers to the brief questions
  notes           TEXT,           -- free-form notes
  
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Why this table:** The review brief workflow is how Dr. Laura's expertise gets into the system without requiring her to read thousands of entries. The AI generates targeted clinical judgment questions, she answers in 30-60 min sessions, and those answers become the highest-confidence entries.

---

## Confidence Scoring Model

Knowledge entries get a composite confidence score (0.0 – 1.0):

```
confidence = (source_authority × 0.3) + (corroboration × 0.3) + (recency × 0.1) + (review_bonus × 0.3)
```

| Factor | Calculation |
|--------|-------------|
| **Source authority** | Leader's authority weight for this domain (0.5 default, 1.0 for domain expert) |
| **Corroboration** | `min(1.0, corroboration_count / 3)` — capped at 3 supporting leaders |
| **Recency** | `1.0 - (years_since_publish / 10)` — decays over 10 years, floor at 0.3 |
| **Review bonus** | `0.0` (unreviewed), `0.8` (approved), `1.0` (Dr. Laura override) |

**Dr. Laura's internal content always gets `confidence = 1.0`** — she is the ground truth for Clinical Signal.

---

## How This Feeds Protocol Generation

When the protocol engine generates a clinical protocol for a patient:

1. **Semantic search** — `clinical_knowledge.embedding` cosine similarity against patient context (intake data, lab results)
2. **Domain filtering** — retrieve entries tagged with relevant domains
3. **Confidence ranking** — sort by `confidence_score` descending
4. **Conflict surfacing** — check `knowledge_conflicts` for any active conflicts in the relevant systems
5. **Resolution application** — use `resolution_context` decision trees to pick the right approach for THIS patient
6. **Provenance citation** — protocol cites which leaders informed each recommendation

The protocol engine prompt would include something like:

```
Based on the knowledge base:
- Dr. Laura (confidence 1.0): Address gut repair before hormones in patients with GI symptoms
- Dr. Hyman (confidence 0.85): Start with metabolic reset for insulin-resistant patients  
- Dr. Cole (confidence 0.82): Gentle gut protocol concurrent with inflammation reduction

CONFLICT NOTE: For patients with both gut and metabolic issues, Dr. Laura recommends
gut-first if Bristol stool <4, otherwise simultaneous approach.
```

---

## Migration Plan

This schema extension would be migration `0016_knowledge_orchestrator.sql`. It:

1. Creates 4 new tables (`knowledge_leaders`, `knowledge_sources`, `knowledge_domains`, `knowledge_conflicts`, `knowledge_review_queue`)
2. Adds 7 columns to `clinical_knowledge` (all nullable/defaulted — no breaking changes)
3. Adds indexes for the new query patterns
4. Seeds the 6 knowledge domains
5. Seeds the 7 trusted leaders from the content catalog
6. Applies RLS to all new tables (same `current_setting('app.current_tenant_id', true)::uuid` pattern)

**Zero downtime** — all changes are additive. Existing data and queries are unaffected.

---

## Entity Relationship Summary

```
knowledge_leaders (7 trusted leaders)
  └── knowledge_sources (books, podcasts, articles, etc.)
        └── clinical_knowledge (individual knowledge entries)
              ├── domains[] → knowledge_domains
              ├── embedding → pgvector for semantic search
              ├── review_status → knowledge_review_queue
              └── clinical_concepts → clinical_relationships (graph edges)

knowledge_conflicts (when leaders disagree)
  ├── positions[] → knowledge_leaders + clinical_knowledge
  └── resolution_context → feeds protocol engine decision trees

knowledge_review_queue (Dr. Laura's review workflow)
  ├── entry_ids[] → clinical_knowledge
  ├── conflict_id → knowledge_conflicts
  └── source_id → knowledge_sources
```

---

## Open Questions for Ryan / Dr. Laura

1. **Embedding model upgrade?** Currently using 384-dim (MiniLM-L6-v2). Should we upgrade to a larger model (e.g., 1024-dim) for better semantic precision, or keep 384 for cost/speed?
2. **Multi-tenant leaders?** Are the 7 leaders shared across all tenants, or could different practices have different trusted leader sets?
3. **Conflict resolution UI?** Should Dr. Laura resolve conflicts through the review queue, or does she need a dedicated conflict resolution interface?
4. **Versioning?** Should knowledge entries be versioned (keep old versions when corrected), or is the current "overwrite + metadata" approach sufficient?
