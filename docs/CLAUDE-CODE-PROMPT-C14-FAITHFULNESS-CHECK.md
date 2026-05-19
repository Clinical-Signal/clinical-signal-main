# Handoff prompt for Claude Code — C.1.4 Faithfulness check on new ingestions

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Add a faithfulness check to the ingestion pipeline

This is C.1.4 from `docs/MVP-PRIORITIZATION-2026-05-08.md` Layer C. The fourth of five foundation engineering items. Goal: every new knowledge entry, at the moment of ingestion, gets scored on how faithfully it represents its source chunk. Low-faithfulness extractions get rejected outright; medium-faithfulness ones get stored but flagged for review; high-faithfulness ones go in clean.

Prior steps done and merged to main:
- C.1.1 — seed `knowledge_leaders` + `knowledge_domains` + backfill `leader_id` (migration `0017`)
- C.1.2 — auto-tag domains on existing 1,144 entries (script + prompt, PR #175 merged as `9e0ea9f`)
- C.1.3 — composite confidence scoring (script + parameter tuning, PR #176 merged as `36d408f`)

Use those as structural templates — same DB connection pattern, same prompt-file convention, same branch/PR hygiene.

## Context: where this fits

The current pipeline is single-shot per chunk:

```
ingest_knowledge.py (extract chunk → JSONL)
  → load_knowledge.py
  → app/knowledge/db.py:insert_knowledge_item
  → row in clinical_knowledge (currently no faithfulness data)
```

The investigation report (`docs/KO-EXTRACTION-AND-CONFLICT-INVESTIGATION.md`) flagged that no entry-vs-source faithfulness check exists today. This task adds it as a second-pass LLM call after each extraction.

## Why faithfulness matters separately from composite confidence

Composite confidence (C.1.3) measures *should this entry rank high in retrieval?* — based on source authority, corroboration, recency, review status. It says nothing about whether the extraction is *correct*.

Faithfulness measures *did the extractor accurately capture what the source actually said?* An extraction that drops a critical caveat ("usually X, BUT in cases of Y, do Z") may produce a confidently-scored but clinically wrong entry. Composite confidence won't catch this; faithfulness will.

These are kept separate in the schema (faithfulness as its own column) so we can audit them independently and tune them independently.

## Implementation

### 1. New prompt: `services/analysis-engine/prompts/faithfulness_check_v1.md`

System prompt that takes a source chunk and an extracted entry and returns a JSON object with a faithfulness score.

Critical: **frame the task explicitly as "evaluating extraction quality of existing trusted-source content, not generating new clinical advice"** to avoid the same safety-classifier refusal pattern that C.1.2 hit on H. pylori content. The model is doing metadata judgment, not making clinical recommendations.

Suggested structure:

```
You are evaluating the quality of an automated knowledge extraction.

The source content has already been authored and reviewed by qualified
practitioners. Your task is metadata judgment: did the extraction faithfully
preserve the key claims of the source? You are not generating clinical advice.

Score on three dimensions, 0.0 to 1.0:
- recall:    did the extraction preserve the key claims of the source?
             1.0 = nothing important lost; 0.0 = key claims missing
- precision: did the extraction add anything not in the source?
             1.0 = nothing invented; 0.0 = significant fabrication
- nuance:    were caveats, conditions, sequencing, or contraindications preserved?
             1.0 = nuance intact; 0.0 = nuance stripped (e.g. "usually X" → "X")

Return ONLY a JSON object, no prose:
{"recall": 0.95, "precision": 1.0, "nuance": 0.7, "notes": "Caveat about
patient-specific dosing was dropped"}

The composite faithfulness_score downstream is min(recall, precision, nuance) —
the weakest of the three drives the result, because any one being broken means
the entry is misleading.
```

### 2. Modify `services/analysis-engine/scripts/ingest_knowledge.py`

After each `extract_chunk` call returns an entry:
- Call the faithfulness check (single LLM call, source chunk + extracted entry as input)
- Compute `faithfulness_score = min(recall, precision, nuance)`
- Add three fields to the JSONL output per entry: `faithfulness_score` (numeric), `faithfulness_breakdown` (the full JSON object for audit), `faithfulness_notes` (optional string from the prompt)

Behavior on the score:

| Range | Action |
|---|---|
| `>= 0.75` | Store normally — high-quality extraction |
| `0.50 to 0.75` | Store, but mark for review (set `review_status = 'pending_review'`). C.1.5 will then auto-insert into `knowledge_review_queue`. |
| `< 0.50` | **Reject — do not write to JSONL.** Log with chunk hash and reason. The extraction is too unfaithful to be useful. |

Make the two thresholds (0.50 reject, 0.75 review) module constants so they're tunable in one place.

### 3. New migration: `database/migrations/0018_add_faithfulness_score.sql`

```sql
ALTER TABLE clinical_knowledge
  ADD COLUMN IF NOT EXISTS faithfulness_score NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS faithfulness_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS faithfulness_notes TEXT;

CREATE INDEX IF NOT EXISTS clinical_knowledge_faithfulness_idx
  ON clinical_knowledge(faithfulness_score)
  WHERE faithfulness_score IS NOT NULL;
```

Idempotent. Faithfulness is NULL for the existing 1,144 entries — they pre-date this column. That's fine; retroactive backfill is optional (see Section 5).

### 4. Modify `services/analysis-engine/scripts/load_knowledge.py` and `app/knowledge/db.py:insert_knowledge_item`

- `load_knowledge.py`: pass the three new fields through from JSONL into `insert_knowledge_item`
- `insert_knowledge_item`: accept the new fields, write to the new columns. Backward compat — if the JSONL doesn't have these fields (old extraction runs), insert NULLs.

### 5. Optional `--retro` flag on a separate script

Write `services/analysis-engine/scripts/recompute_faithfulness.py` that processes existing entries (where `faithfulness_score IS NULL`) by:
- Pulling the entry's `source_chunk_hash`
- Looking up the corresponding source chunk in the JSONL files under `database/seed/knowledge/`
- Running the same faithfulness check
- Writing the score back

Don't run this by default. It costs ~$3-5 to retro the existing 1,144 entries. Document the command in the script's docstring; we can run it later if quality issues surface in the corpus.

## Hard constraints

- **Don't change the extraction prompt or logic.** This is purely additive — a second pass evaluates what extraction produced, not modifies it.
- **Thresholds as module constants.** `REJECT_THRESHOLD = 0.50`, `REVIEW_THRESHOLD = 0.75` at the top of `ingest_knowledge.py`. Easy to tune.
- **Backward compatible.** Old JSONL without faithfulness fields still loads; old DB rows have NULL faithfulness; downstream queries that don't know about faithfulness still work.
- **Tenant safety.** Same pattern as C.1.2 / C.1.3 — `set_config('app.current_tenant_id', ...)` on the connection.
- **Idempotent.** Re-running ingestion on the same input produces the same JSONL output (modulo LLM non-determinism, which is unavoidable).
- **No PHI.** General knowledge content, safe for LLM evaluation.
- **Branch:** `feat/c14-faithfulness-check`. Draft PR. Don't merge.

## Verification before done

1. **Unit-level smoke test** — write a small Python script (or a one-off inside the analysis-engine container) that runs the faithfulness check on three handcrafted pairs:
   - Faithful pair (extraction matches source) — expect score ≥ 0.85
   - Lossy pair (extraction drops a key caveat from the source) — expect score 0.40-0.65 (the nuance dimension should drag the score down)
   - Fabricated pair (extraction adds claims not in the source) — expect score < 0.40 (precision should drop hard)

   If those don't roughly come out as expected, the prompt needs tuning before any real ingestion is run.

2. **Integration test** — run `ingest_knowledge.py` on one small chunked source file (pick the smallest in `database/seed/knowledge/`, ideally a few hundred lines). Verify:
   - JSONL output includes the three new faithfulness fields
   - Some entries land in each bucket (high / review-flagged / rejected)
   - Logged rejections have chunk hash and reason

3. **Migration smoke test** — apply `0018_add_faithfulness_score.sql` to the dev DB. Verify columns exist:

   ```sql
   \d clinical_knowledge
   -- Look for faithfulness_score, faithfulness_breakdown, faithfulness_notes
   ```

4. **Load test** — run `load_knowledge.py` on the small JSONL from step 2. Verify rows land in `clinical_knowledge` with faithfulness fields populated. Check distribution:

   ```sql
   SELECT
     COUNT(*) FILTER (WHERE faithfulness_score IS NULL) AS null_score,
     COUNT(*) FILTER (WHERE faithfulness_score >= 0.75) AS high_quality,
     COUNT(*) FILTER (WHERE faithfulness_score >= 0.50 AND faithfulness_score < 0.75) AS needs_review,
     COUNT(*) FILTER (WHERE faithfulness_score < 0.50) AS rejected_should_be_zero,
     AVG(faithfulness_score) AS avg_score
   FROM clinical_knowledge;
   ```

   The `rejected_should_be_zero` count should be exactly 0 — rejected entries shouldn't make it to the DB at all. If it's non-zero, something's leaking past the reject threshold.

## Deliverable

- New prompt: `services/analysis-engine/prompts/faithfulness_check_v1.md`
- Modified: `services/analysis-engine/scripts/ingest_knowledge.py`
- Modified: `services/analysis-engine/scripts/load_knowledge.py`
- Modified: `services/analysis-engine/app/knowledge/db.py`
- New migration: `database/migrations/0018_add_faithfulness_score.sql`
- New (optional) script: `services/analysis-engine/scripts/recompute_faithfulness.py`
- Draft PR titled "C.1.4 — Faithfulness check on new ingestions" with:
  - Verification output from all four checks above
  - Sample of the LLM output for a few representative entries (high / review / rejected)
  - Cost estimate per 1,000 entries based on the integration test
  - Note on whether the smoke test prompt-tuning loop required any iteration

When done, paste the verification queries' output and the PR URL.
