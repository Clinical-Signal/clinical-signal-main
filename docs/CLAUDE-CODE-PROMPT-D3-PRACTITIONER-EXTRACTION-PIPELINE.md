# Handoff prompt for Claude Code — D.3 Extraction pipeline for practitioner-uploaded content

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Extract practitioner-uploaded files into knowledge entries in their private layer

Per `docs/LAYER-D-PRACTITIONER-EXTENSIBILITY.md` — "Extraction pipeline" section. Practitioner uploads (D.2) sit at `upload_status = 'uploaded'`. This task wires extraction → write to `practitioner_knowledge` (per-practitioner) → run faithfulness check → run `post_ingest_finalize` (autotag + recompute + enqueue, per C.1.6) for that tenant.

**Depends on:** D.1 + D.2 merged. C.1.6 (post-ingest finalize wiring) merged. Verify before starting.

**Read first:**
- `docs/LAYER-D-PRACTITIONER-EXTENSIBILITY.md` — Extraction pipeline section
- `services/analysis-engine/scripts/ingest_knowledge.py` — the existing extraction pipeline you'll be paralleling

## Implementation

### 1. New ingestion script — `services/analysis-engine/scripts/ingest_practitioner_upload.py`

Parallels `ingest_knowledge.py` but writes to `practitioner_knowledge` (per-practitioner-scoped) instead of `clinical_knowledge` (shared). Same chunking, same faithfulness check (C.1.4), same post-ingest finalize (C.1.6).

Key differences vs. `ingest_knowledge.py`:

- **Input is a single upload** identified by `upload_id`, not a JSONL of pre-extracted entries.
- **Reads the source file** from S3 (or local UPLOADS_DIR in dev) using the path in `practitioner_uploads.s3_key`.
- **Extracts text** based on `file_type` — use the same extraction logic as `intake-docs/route.ts` (mammoth for DOCX, native PDF text extraction, plain text for txt/md, etc.).
- **Writes to `practitioner_knowledge`** with `practitioner_id` from the upload row.
- **No `leader_id`** — Layer D entries don't have a leader. The practitioner_id IS the source.
- **No `confidence_score` computation in the C.1.3 sense** — practitioner content is implicitly trusted (per design doc: "everything practitioner uploads is implicitly trusted by them"). Skip the composite formula.
- **Faithfulness check still runs** (same C.1.4 prompt, same three-dimensional scoring) — extraction errors still need catching even on practitioner-trusted source content.
- **Updates `practitioner_uploads.upload_status`** through the pipeline: `'uploaded'` → `'extracting'` (start) → `'extracted'` (success) or `'failed'` (with error in `extraction_error`).

### 2. Extraction trigger from the upload endpoint

Modify `apps/web/lib/practitioner-knowledge.ts` (created in D.2) to enqueue extraction after a successful upload. Two options:

**Option A — Synchronous (simpler for MVP):** call the extraction inline at the end of `uploadPractitionerFile`. Practitioner waits for extraction before the API returns. Risk: long files (e.g., 50MB PDF) keep the request hanging for minutes; not great UX.

**Option B — Background job (better UX):** insert the upload row, return immediately, and trigger extraction asynchronously. Requires either a job queue (overkill for MVP) or the analysis-engine FastAPI service polling for `upload_status = 'uploaded'` rows and processing them.

**Recommendation: Option B with a thin polling-style trigger.** The analysis-engine already has FastAPI running. Add an endpoint `/practitioner/extract` that the Next.js route calls (HTTP POST with `upload_id`) right after inserting the row. The analysis-engine receives the trigger, picks up the file, runs extraction, updates status. Practitioner sees the status change in the management UI (D.5).

This matches the existing pattern between Next.js and the analysis-engine for lab record extraction.

### 3. The extraction flow per upload

```
1. Practitioner uploads file (D.2 endpoint)
   → POST /api/practitioner/uploads
   → File written to S3, row inserted with upload_status='uploaded'
   → Next.js calls analysis-engine: POST /practitioner/extract { upload_id }
   → Returns 200 to practitioner

2. Analysis-engine receives extract trigger:
   → UPDATE practitioner_uploads SET upload_status='extracting' WHERE id=upload_id
   → Read file from S3 / UPLOADS_DIR using s3_key
   → Extract text per file_type (mammoth for docx, etc.)
   → Chunk text (reuse chunking logic from ingest_knowledge.py)
   → For each chunk:
     a. Extract knowledge entry via the existing knowledge_extraction_v1 prompt
     b. Run faithfulness check (C.1.4) on the entry
     c. If faithfulness < 0.50: reject (skip insert, log)
     d. Else: INSERT into practitioner_knowledge with practitioner_id, faithfulness fields
   → Run post_ingest_finalize(conn, tenant_id) — same function from C.1.6
     (this autotags domains, recomputes confidence for the tenant — but for Layer D
      entries, "confidence" is mostly meaningless since source_authority is uniform
      and review_bonus collapses; the formula still runs but the values cluster
      tightly — that's fine)
   → UPDATE practitioner_uploads SET upload_status='extracted', extracted_at=now()

3. Practitioner refreshes D.5 management UI → sees their entries
```

### 4. Failure handling

If extraction fails at any step:
- UPDATE practitioner_uploads SET upload_status='failed', extraction_error=<error message>
- Practitioner sees the error in the D.5 UI
- They can re-upload the same file (creates a new upload row) or delete and try a different format

## Hard constraints

- **practitioner_knowledge is private — RLS-enforced.** Test that Practitioner B's extracted entries cannot be SELECT'd from Practitioner A's session.
- **Reuse existing extraction code wherever possible.** The chunking logic, the LLM client (post-PR-#172 it's `app/knowledge/llm.py` or wherever), the faithfulness check function — all should be shared, not duplicated.
- **Faithfulness check uses the existing prompt.** No new prompt for Layer D — `prompts/faithfulness_check_v1.md` is appropriate as-is. The prompt's framing ("evaluating extraction quality of trusted-source content") fits practitioner content the same way it fits Clinical Signal core content.
- **post_ingest_finalize must be tenant-scoped (not practitioner-scoped) since that's how it was written for C.1.6.** Pass the tenant_id; it'll process all the tenant's content. That's fine — repeated calls with no new entries are no-ops per C.1.6's idempotency.
- **No PHI in extracted text.** Practitioner methodology files don't contain patient data. If a practitioner accidentally uploads something that does, that's a UX issue to surface (post-MVP), not an architectural one.
- **Branch:** `feat/d3-practitioner-extraction-pipeline`. Draft PR. Don't merge.

## Verification

1. Apply (D.1 + D.2 + C.1.6 must already be merged)
2. Upload a real PDF (e.g., a sample protocol you have lying around) via D.2 endpoint
3. Verify the analysis-engine picks it up and processes it:

```sql
-- Watch status change
SELECT id, original_filename, upload_status, extraction_error, extracted_at
  FROM practitioner_uploads
 WHERE id = '<upload_id>';
-- Should progress: uploaded → extracting → extracted (within 30-60 seconds)
```

4. Verify entries landed in practitioner_knowledge:

```sql
SELECT COUNT(*) FROM practitioner_knowledge WHERE upload_id = '<upload_id>';
-- Should return some number > 0 (depending on file content)

SELECT title, faithfulness_score, domains
  FROM practitioner_knowledge
 WHERE upload_id = '<upload_id>'
 ORDER BY id LIMIT 10;
-- Eyeball: titles match the source content, faithfulness scores look reasonable,
-- domains are auto-tagged (the post_ingest_finalize from C.1.6 should have run)
```

5. Cross-tenant privacy test (CRITICAL):
   - As Practitioner A: upload a file, wait for extraction, count entries
   - As Practitioner B (different tenant or same tenant): query `practitioner_knowledge` — must NOT see Practitioner A's entries
   - This is the moat invariant: Layer D content NEVER appears in another practitioner's queries

6. Failure path test:
   - Upload a corrupted PDF or empty docx → upload_status should land at 'failed' with clear extraction_error
   - Practitioner can see the error in the response or via list endpoint

## Deliverable

- New: `services/analysis-engine/scripts/ingest_practitioner_upload.py`
- New: FastAPI endpoint at `services/analysis-engine/app/...` (path TBD based on existing structure) — `POST /practitioner/extract`
- Modified: `apps/web/lib/practitioner-knowledge.ts` (D.2 file) — add the post-upload trigger to the analysis-engine
- Draft PR titled "D.3 — Extraction pipeline for practitioner-uploaded content"
- PR body: verification output, including the cross-tenant privacy test result

When done, paste the PR URL. After this merges, D.4 (cross-layer retrieval) is unblocked.
