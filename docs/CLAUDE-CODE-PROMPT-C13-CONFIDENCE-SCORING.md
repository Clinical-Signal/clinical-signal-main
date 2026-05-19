# Handoff prompt for Claude Code — C.1.3 Composite confidence scoring

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Implement composite confidence scoring for clinical_knowledge entries

This is C.1.3 from `docs/MVP-PRIORITIZATION-2026-05-08.md` Layer C. Foundation work that enables retrieval to rank entries meaningfully. Right now every row is at the schema default `confidence_score = 0.50`, so retrieval has no priority signal and high-quality entries get treated the same as low-quality ones.

Prior steps done: C.1.1 (seed leaders + domains, backfill leader_id) and C.1.2 (auto-tag domains on 1,144 entries). Use the work in `services/analysis-engine/scripts/autotag_domains.py` as the structural template — same kind of script, same DB connection pattern, same tenant safety approach.

## The formula

From `docs/knowledge-orchestrator/knowledge-schema-design.md:259`:

```
confidence_score = (source_authority × 0.3)
                 + (corroboration  × 0.3)
                 + (recency        × 0.1)
                 + (review_bonus   × 0.3)
```

All four factors normalized to `[0, 1]` so the final score is also `[0, 1]` (which matches the `NUMERIC(3,2)` column).

Read that whole section of the schema-design doc before implementing — it has the intended definitions for each factor. Don't reinvent them; use what's already specified. If anything in the spec is ambiguous, default to the simplest interpretation and note it in the PR description so we can tighten the formula later.

## How to compute each factor

**1. `source_authority`** — derived from `knowledge_leaders.is_internal` and `knowledge_leaders.authority_domains`.

- `is_internal = true` (Dr. Laura) → 1.0 baseline (she's the practitioner-of-record)
- External leader, entry's domain ∈ leader's `authority_domains` → 0.85 (e.g., Gottfried on hormones)
- External leader, entry's domain ∉ leader's `authority_domains` → 0.65 (e.g., Gottfried on something other than hormones)
- No `leader_id` → 0.5 (shouldn't happen after C.1.1, but defend against it)

For multi-domain entries: take the max source_authority across their domains.

**2. `corroboration`** — how many *other* entries in the knowledge base cover the same concept. Higher corroboration = more sources agree this matters.

Approach: for each entry, find the count of other entries with overlapping domain tags AND high embedding similarity (cosine ≥ 0.85, or whatever threshold the existing `clinical_knowledge_embedding_idx` query patterns use — check `lib/analysis.ts` for how it's queried in production). Then normalize:

```
corroboration = min(other_corroborating_entries / 10, 1.0)
```

So 10+ corroborating entries → 1.0, 0 → 0.0. Tune the divisor later if it's too generous or too stingy.

**3. `recency`** — newer content is preferred for evolving topics (supplements, protocols, research). Use `clinical_knowledge.created_at` as the timestamp.

```
years_old = (now() - created_at) in years
recency = max(0, 1 - (years_old / 5))
```

So entries < 1 year old → ~1.0, entries 5+ years old → 0.0. (The 5-year half-life is a starting heuristic; tune later.)

**4. `review_bonus`** — depends on `clinical_knowledge.review_status`:

- `'reviewed_approved'` → 1.0
- `'reviewed_edited'` → 0.85 (Dr. Laura looked at it and tweaked it)
- `'unreviewed'` → 0.5 (the current state of all 1,144 entries)
- `'flagged'` → 0.2
- `'reviewed_rejected'` → 0.0 (these probably shouldn't be in retrieval at all, but the score reflects it)

After C.1.5 (auto-flag low-confidence to review queue) ships, `review_status` will start changing. For now, all 1,144 entries are `'unreviewed'`, so they all get `review_bonus = 0.5`.

## Implementation

Write a Python script at `services/analysis-engine/scripts/recompute_confidence.py`:

1. Connects to DB (same pattern as `autotag_domains.py`)
2. Pulls each row from `clinical_knowledge` along with the joined `knowledge_leaders` row (need `is_internal`, `authority_domains`)
3. For each row, computes the four factors and the composite score
4. UPDATEs `clinical_knowledge.confidence_score` and `clinical_knowledge.corroboration_count` (the schema also has a `corroboration_count` column — populate it with the raw count, not the normalized factor)
5. Batches UPDATEs (50 rows per transaction)
6. Prints progress + final summary: distribution of scores in buckets (`< 0.4`, `0.4-0.6`, `0.6-0.8`, `> 0.8`)

The corroboration step is the expensive one (embedding similarity self-join). Two implementation options:

- **Option A (simpler):** SQL self-join using pgvector cosine similarity, in a single query that computes corroboration_count for every row at once. Then a separate pass computes the rest of the factors and writes the final score. Pros: fast, one round-trip. Cons: that self-join might be slow on 1,144² = ~1.3M comparisons, but pgvector should handle it.
- **Option B (Python loop):** for each row, run a separate similarity query, accumulate counts, compute composite. Slower but easier to debug.

Try Option A first. If it's slow (> 60 seconds total), Option B. If it's prohibitively slow, that's data we want to know — note it in the PR description.

## Hard constraints

- **Idempotent.** Re-running the script overwrites `confidence_score` with the same values for the same input data. Don't accumulate or skip-on-existing.
- **Tenant-scoped.** Iterate per tenant — corroboration is meaningful within a tenant, not across. Should already be the case if you query `clinical_knowledge` with proper tenant filtering.
- **No PHI.** `clinical_knowledge` is general knowledge, no patient data. Safe.
- **No behavior change to existing pipelines.** This is a one-shot recompute script. Wiring confidence-scoring into new ingestion is part of C.1.4.
- **Branch:** `feat/c13-confidence-scoring`. Draft PR. Don't merge.

## Verification before done

```sql
-- Distribution of scores
SELECT
  COUNT(*) FILTER (WHERE confidence_score < 0.40) AS very_low,
  COUNT(*) FILTER (WHERE confidence_score >= 0.40 AND confidence_score < 0.60) AS low,
  COUNT(*) FILTER (WHERE confidence_score >= 0.60 AND confidence_score < 0.80) AS medium,
  COUNT(*) FILTER (WHERE confidence_score >= 0.80) AS high,
  COUNT(*) AS total,
  AVG(confidence_score) AS avg_score
FROM clinical_knowledge;

-- Sanity check: Dr. Laura's entries should skew higher than the unreviewed-default 0.5
-- (all internal, 0.5 review_bonus, varying corroboration + recency)
SELECT
  l.is_internal,
  COUNT(*) AS n,
  ROUND(AVG(ck.confidence_score)::numeric, 3) AS avg_score,
  MIN(ck.confidence_score) AS min_score,
  MAX(ck.confidence_score) AS max_score
FROM clinical_knowledge ck
JOIN knowledge_leaders l ON l.id = ck.leader_id
GROUP BY l.is_internal;

-- Spot-check: 10 highest, 10 lowest
SELECT id, source_channel, title, confidence_score, corroboration_count, domains
FROM clinical_knowledge
ORDER BY confidence_score DESC LIMIT 10;

SELECT id, source_channel, title, confidence_score, corroboration_count, domains
FROM clinical_knowledge
ORDER BY confidence_score ASC LIMIT 10;
```

Expected on this dev DB (all 1,144 entries are Dr. Laura, all unreviewed):

- All entries have `source_authority = 1.0` (internal) and `review_bonus = 0.5` (unreviewed). So those two factors contribute a fixed `0.30 + 0.15 = 0.45` to every entry.
- Variation comes from `corroboration` (0.0-1.0 × 0.30 = 0.0-0.30) and `recency` (0.0-1.0 × 0.10 = 0.0-0.10).
- Theoretical range: `0.45` to `0.85`. Actual distribution depends on data.
- Eyeball the 10 highest — should be entries that are well-corroborated AND recent (e.g., a recent Slack thread on a heavily-discussed topic like gut dysbiosis).
- Eyeball the 10 lowest — should be entries that are isolated (low corroboration) and/or old.

If the distribution looks degenerate (e.g., everything bunched at 0.45 because corroboration is broken, or 0.85 because the threshold is too generous), note it in the PR — that's data to tune the formula on.

## Deliverable

- Script at `services/analysis-engine/scripts/recompute_confidence.py`
- Updated `clinical_knowledge.confidence_score` and `corroboration_count` for all 1,144 rows
- Draft PR titled "C.1.3 — Composite confidence scoring for clinical_knowledge entries" with the verification query results pasted in the description, plus a note on which corroboration option (A or B) you used and how long the run took.

When done, paste the verification output and the PR URL.
