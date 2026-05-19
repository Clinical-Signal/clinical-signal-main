# Layer D — Per-Practitioner Extensibility (Engineering Design)

**Created:** May 10, 2026
**Status:** Design — not yet implemented
**Belongs to:** MVP scope per `docs/MVP-PRIORITIZATION-2026-05-08.md` rev 6 and the moat statement in `CLAUDE.md`.

---

## What Layer D is

Each practitioner can upload their own clinical content — sample protocols, methodology documents, case notes, training materials, anything they've authored — into a private knowledge layer scoped to them. That content combines with Clinical Signal core (Layer C) at protocol-generation time, with conflicts surfaced inline so the practitioner picks which to follow.

Per Ryan May 10, key constraints:

- **Private by default.** No Clinical Signal review of practitioner-uploaded content. It's their workspace.
- **Start simple.** A place to drop PDFs and Word docs. UX iterates later.
- **Influences only their own protocols.** A practitioner's Layer D content does not bleed into other practitioners' protocols or back into the Clinical Signal core.
- **Conflict surfacing, not silent merging.** When Layer D content contradicts Layer C, both positions render with citations and the practitioner decides.

## Why this is the moat

Per CLAUDE.md, Layer 1 (Clinical Signal core) is necessary but replicable — a competitor with sufficient resources could build a similar curated knowledge base in 12-18 months. **Layer D is the durable defense:** a practitioner who's spent six months loading their methodology, sample protocols, and case notes into Clinical Signal cannot trivially switch to a competitor. Their accumulated personal value compounds the longer they use the platform. Healthy lock-in via personal data, not coercion.

## Schema design

New migration `0019_practitioner_knowledge.sql` (number to be confirmed against current head).

### Table 1: `practitioner_uploads`

Tracks the raw files practitioners upload. Lightweight metadata; the actual files live in S3.

```sql
CREATE TABLE IF NOT EXISTS practitioner_uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  file_type       TEXT NOT NULL CHECK (file_type IN (
    'pdf', 'docx', 'txt', 'md', 'pptx', 'other'
  )),
  s3_key          TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  upload_status   TEXT NOT NULL DEFAULT 'uploaded' CHECK (upload_status IN (
    'uploaded', 'extracting', 'extracted', 'failed', 'deleted'
  )),
  extraction_error TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  extracted_at    TIMESTAMPTZ,
  UNIQUE (tenant_id, s3_key)
);

CREATE INDEX practitioner_uploads_practitioner_idx
  ON practitioner_uploads(tenant_id, practitioner_id);
CREATE INDEX practitioner_uploads_status_idx
  ON practitioner_uploads(upload_status);

-- RLS: practitioners see only their own uploads
ALTER TABLE practitioner_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON practitioner_uploads
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

### Table 2: `practitioner_knowledge`

Mirrors `clinical_knowledge` shape but scoped per practitioner.

```sql
CREATE TABLE IF NOT EXISTS practitioner_knowledge (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  upload_id       UUID REFERENCES practitioner_uploads(id) ON DELETE CASCADE,

  -- Same shape as clinical_knowledge
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  embedding       vector(384),
  metadata        JSONB NOT NULL DEFAULT '{}',
  domains         TEXT[] DEFAULT '{}',
  source_chunk_hash TEXT,

  -- Layer D doesn't need leader_id (practitioner_id IS the source)
  -- Layer D doesn't need confidence_score in the Layer C sense
  --   (everything practitioner uploads is implicitly trusted by them)
  -- Layer D DOES need faithfulness_score to catch extraction errors
  faithfulness_score NUMERIC(3,2),
  faithfulness_breakdown JSONB,
  faithfulness_notes TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, practitioner_id, source_chunk_hash, title)
);

CREATE INDEX practitioner_knowledge_practitioner_idx
  ON practitioner_knowledge(tenant_id, practitioner_id);
CREATE INDEX practitioner_knowledge_embedding_idx
  ON practitioner_knowledge USING ivfflat(embedding vector_cosine_ops);
CREATE INDEX practitioner_knowledge_domains_idx
  ON practitioner_knowledge USING GIN(domains);

ALTER TABLE practitioner_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON practitioner_knowledge
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

**Why a separate table instead of adding a `practitioner_id` column to `clinical_knowledge`:** retrieval queries are different shape (always scoped per-practitioner for Layer D, never cross-practitioner; never queried alongside Layer C in the same SQL). Separate tables make the privacy invariant enforceable at the schema level — there's no way to accidentally leak Practitioner A's content into Practitioner B's protocol generation by forgetting a WHERE clause.

### Table 3: `practitioner_conflict_resolutions`

Tracks how a practitioner has resolved Layer C vs Layer D conflicts in the past, so the same conflict doesn't re-prompt forever.

```sql
CREATE TABLE IF NOT EXISTS practitioner_conflict_resolutions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,

  layer_c_entry_id UUID REFERENCES clinical_knowledge(id) ON DELETE SET NULL,
  layer_d_entry_id UUID REFERENCES practitioner_knowledge(id) ON DELETE CASCADE,

  topic           TEXT NOT NULL,             -- the concept they conflicted on
  resolution      TEXT NOT NULL CHECK (resolution IN (
    'prefer_layer_c', 'prefer_layer_d', 'use_both', 'situational'
  )),
  notes           TEXT,                      -- practitioner's free-form note
  resolved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, practitioner_id, layer_c_entry_id, layer_d_entry_id)
);

CREATE INDEX practitioner_conflict_resolutions_practitioner_idx
  ON practitioner_conflict_resolutions(tenant_id, practitioner_id);

ALTER TABLE practitioner_conflict_resolutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON practitioner_conflict_resolutions
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

## Upload flow

1. Practitioner navigates to `/dashboard/knowledge/my-uploads` (new page in Layer D UI work).
2. They drag-drop or file-select a PDF / Word doc / text file.
3. Frontend POST to `/api/practitioner/uploads` — multipart form data, tenant-scoped, content-type validated (per A.3.3 work — bake it in here so Layer D doesn't reintroduce the gap).
4. API stores file in S3 under `s3://<bucket>/practitioner-uploads/<tenant_id>/<practitioner_id>/<upload_id>.<ext>`.
5. Insert row into `practitioner_uploads` with `upload_status = 'uploaded'`.
6. Enqueue background job: extract text from file → run `ingest_knowledge.py`-style pipeline → write to `practitioner_knowledge` → run `post_ingest_finalize` for that tenant.
7. UI polls or subscribes to status changes; once `upload_status = 'extracted'`, practitioner sees their entries listed.

## Extraction pipeline

Reuses the C.1 foundation almost entirely:

- Same chunking logic as `ingest_knowledge.py`
- Same faithfulness check (C.1.4) — extraction errors still need catching, even on practitioner-trusted source content
- Domain auto-tagging (C.1.2 logic) — runs the same way
- **No source_authority computation** — practitioner content is implicitly trusted by definition
- **No corroboration computation** — Layer D entries don't corroborate against each other in the same way (one practitioner's content isn't "more trusted" because they have multiple entries on the same topic)
- **No review_bonus / review queue** for Layer D — practitioner doesn't review their own content; they wrote it (or curated it)

The faithfulness check IS valuable here because the *extractor* can still fabricate or drop nuance. If a practitioner uploads "use 1000mg vitamin D for patients with VDR polymorphism" and the extractor produces "use 1000mg vitamin D for patients" without the conditional, that's an extraction failure the system should catch and flag.

## Retrieval logic — combining Layer C + Layer D

At protocol generation time, given a patient's intake + symptoms + labs:

1. **Build retrieval query** from patient context (existing logic in `lib/analysis.ts` — extend to also query Layer D).
2. **Query Layer C** (`clinical_knowledge`) — existing behavior, ranked by composite confidence.
3. **Query Layer D** (`practitioner_knowledge`) for THIS practitioner only — embedding similarity against the same query, no per-entry confidence ranking (everything's trusted equally; rank by similarity alone).
4. **Cross-layer conflict detection:**
   - For each retrieved Layer D entry, check if there's a Layer C entry on the same `(domain, topic)` with opposing position
   - "Opposing" heuristic: similar embedding (cosine ≥ 0.80) but contradicting `relationship_type` in `clinical_relationships`, OR free-text contradiction detection (deferred to a later iteration — for v1, use the heuristic alone)
   - Check `practitioner_conflict_resolutions` for whether this practitioner has already resolved this conflict; if yes, apply their resolution silently
5. **Pass to model** with provenance tags. Each chunk gets a `source` field: `clinical_signal_core` or `practitioner_layer`. The model can use both but knows which is which.
6. **For unresolved conflicts:** include a `conflicts` field in the protocol output payload listing each conflict with both positions and citations. Protocol editor renders them inline (C.3.3 work).

## UI sketch

`/dashboard/knowledge/my-uploads` (new):
- Top: "Drag files here or click to upload" zone
- Below: table of uploads (filename, type, status, extracted entry count, uploaded date, actions)
- Per-row actions: View entries, Re-upload, Delete
- Empty state: short explainer of what Layer D is and how it influences protocols

`/dashboard/knowledge/my-uploads/[uploadId]/entries` (new):
- List of `practitioner_knowledge` rows extracted from this upload
- Each shows: title, category, domains, content snippet, faithfulness score (if low, highlight)
- Practitioner can delete individual entries (rare but possible if extraction was bad)

`/dashboard/patients/[id]/protocol/[protocolId]/edit/page.tsx` (existing, modified):
- New "Conflicts" panel in the protocol editor sidebar
- For each unresolved cross-layer conflict in this protocol's generation context:
  - Side-by-side: Layer C position (with leader citation) vs. Layer D position (with practitioner's upload as citation)
  - Resolution buttons: "Use Clinical Signal core" / "Use my own" / "Use both — situational" / "Add a note"
  - On resolve, write to `practitioner_conflict_resolutions` and re-render
- After all conflicts resolved, "Generate" or "Re-generate" button uses the resolved set

## Hard architectural constraints

- **Layer D content NEVER appears in another practitioner's retrieval, period.** Enforced at SQL level via WHERE clauses + RLS policies. Test this explicitly before MVP launch (cross-practitioner test in the smoke test).
- **Layer D content NEVER feeds back into Clinical Signal core.** No "promote this to core" feature in MVP. (If Dr. Laura wants to evangelize a particular practitioner's contribution into core, that's a manual operator action, not a product feature.)
- **Layer D ingestion uses the same faithfulness check as Layer C** — extraction failures get flagged regardless of source.
- **Practitioner can delete their entire Layer D layer at any time** (data portability + privacy). Deletion is permanent; their next protocol generation reverts to Clinical Signal core only.
- **Per-practitioner storage is real cost.** S3 raw files + extracted entries scale linearly with practitioner adoption. Cost analysis in `docs/COST-IMPACT-MVP-SCOPE-UPDATE.md`.

## What's NOT in MVP Layer D

Reserved for Phase 1.5 / Phase 2:

- Guided onboarding interview ("tell us how you work with clients" agent)
- Practitioner can view aggregated stats on their Layer D ("you have 47 entries about gut health")
- Versioning of practitioner content (re-upload replaces; no history)
- Sharing Layer D between practitioners in the same clinic (multi-practitioner team feature, Phase 3)
- Bulk operations (delete all gut-related entries, etc.)
- Practitioner-initiated "promote to core" workflow

## Effort breakdown

Per the prioritization doc (rev 6), Layer D items D.1-D.5 sum to roughly 6-9 days of focused engineering. Inline conflict surfacing (C.3.3) is an additional 2-3 days, listed under C.3 but tightly coupled to Layer D existing.

Total Layer D + C.3.3: ~8-12 days = ~1.5-2.5 weeks.

## Verification gates for "Layer D ready"

Per the quality-gate model, Layer D is ready for MVP when ALL of:

- A practitioner can upload a PDF and within 5 minutes see extracted entries listed in their UI
- Generating a new protocol pulls relevant entries from BOTH Layer C and Layer D, visible in the protocol context
- When Layer C and Layer D contradict on a patient case, the protocol editor surfaces the conflict and the practitioner can resolve it
- The resolution is remembered for future protocols on similar topics
- Cross-practitioner privacy test: Practitioner B's Layer D content cannot appear in Practitioner A's protocol generation (verified via RLS test in the smoke test)
- Faithfulness check catches extraction errors on practitioner content the same way it catches them on Layer C content
