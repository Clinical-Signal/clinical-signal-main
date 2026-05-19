# Handoff prompt for Claude Code — C.1.5 Auto-flag low-quality entries to the review queue

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Auto-populate `knowledge_review_queue` so Dr. Laura's review session has actionable items

This is C.1.5 from `docs/MVP-PRIORITIZATION-2026-05-08.md` Layer C — the **last** of the five foundation engineering items. After this lands, foundation is complete and we can move to C.2 (external leader ingestion) and C.3 (conflict detection).

Prior steps merged: C.1.1 (seed migration `0017`), C.1.2 (autotag domains, PR #175), C.1.3 (composite confidence scoring, PR #176), C.1.4 (faithfulness check, PR #177).

## Context: what's missing

The `knowledge_review_queue` table exists (created in migration `0016`) but **nothing writes to it.** Per the investigation report, `grep -rn knowledge_review_queue` across `services/` and `apps/` returns zero outside the migration. Dr. Laura has nowhere to start her review work because nothing is staged for her.

C.1.5 fixes that — writes the queue-population logic so two categories of entries automatically land in front of her:

1. **Low composite confidence** — entries where `confidence_score < threshold` (per the C.1.3 formula). Useful for catching entries that are isolated, dated, or otherwise low-signal across the four scoring factors.
2. **Borderline faithfulness** — entries where C.1.4 set `review_status = 'pending_review'` because the extraction landed in the 0.50-0.75 faithfulness band. Useful for catching extractions that *might* be misrepresenting the source.

Conflict-flagging is a separate review_type that C.3.1 will populate later — out of scope here.

## Implementation

### 1. New library function in `services/analysis-engine/app/knowledge/db.py`

Add `enqueue_review_items(conn, tenant_id) -> dict` that scans `clinical_knowledge` for the tenant and inserts rows into `knowledge_review_queue` for entries that meet either flag condition.

Pseudocode:

```python
def enqueue_review_items(conn, tenant_id):
    # Returns counts: {"low_confidence": N, "low_faithfulness": M, "skipped_already_queued": K}

    # 1. Low composite confidence
    INSERT INTO knowledge_review_queue (
        tenant_id, knowledge_item_id, review_type, status, notes
    )
    SELECT %tenant_id, ck.id, 'low_confidence', 'pending',
           'Composite confidence ' || ck.confidence_score || ' below threshold ' || %threshold
    FROM clinical_knowledge ck
    WHERE ck.tenant_id = %tenant_id
      AND ck.confidence_score < %threshold
      AND NOT EXISTS (
        SELECT 1 FROM knowledge_review_queue q
        WHERE q.knowledge_item_id = ck.id
          AND q.review_type = 'low_confidence'
          AND q.status IN ('pending', 'in_progress')
      )
    RETURNING id;

    # 2. Borderline faithfulness (review_status set by C.1.4)
    INSERT INTO knowledge_review_queue (
        tenant_id, knowledge_item_id, review_type, status, notes
    )
    SELECT %tenant_id, ck.id, 'low_faithfulness', 'pending',
           'Faithfulness ' || ck.faithfulness_score || ' (' || coalesce(ck.faithfulness_notes, 'no notes') || ')'
    FROM clinical_knowledge ck
    WHERE ck.tenant_id = %tenant_id
      AND ck.review_status = 'pending_review'
      AND NOT EXISTS (
        SELECT 1 FROM knowledge_review_queue q
        WHERE q.knowledge_item_id = ck.id
          AND q.review_type = 'low_faithfulness'
          AND q.status IN ('pending', 'in_progress')
      )
    RETURNING id;
```

The `NOT EXISTS` subquery makes both inserts idempotent — re-running the function won't duplicate queue rows for the same `(knowledge_item_id, review_type)` pair if there's already a pending or in-progress row. Resolved/dismissed rows in history don't block re-queueing if the entry's score later drops back below threshold (rare, but possible after a recompute).

### 2. Two integration points

**a) Post-load hook in `services/analysis-engine/scripts/load_knowledge.py`**

After the load completes successfully (all rows committed), call `enqueue_review_items(conn, tenant_id)` and print the returned counts. This means new ingestions automatically populate the queue without any operator step.

**b) Standalone script `services/analysis-engine/scripts/enqueue_review.py`**

For one-off batch runs (e.g., after recomputing confidence scores, or first-time seeding the queue against the existing 1,144 entries). Same pattern as `recompute_confidence.py`:

- Reads `DATABASE_URL`
- Iterates over tenants
- Calls `enqueue_review_items` per tenant
- Prints summary

### 3. Threshold

Make `LOW_CONFIDENCE_THRESHOLD` a module constant in `db.py`, default `0.75`.

**On the chosen default:** with the current dev-DB distribution (0.68-0.98, mean 0.712), 0.75 flags roughly the bottom 30-40% of entries (~400-500 rows). That's a lot for a first review session. Two reasons it's still the right starting default:

1. We need *some* entries in the queue to validate the workflow end-to-end. Setting too low (e.g., 0.65) catches near-zero entries on this corpus and we can't see if the queue UI even renders.
2. Production tuning should happen *after* Dr. Laura tells you what her review capacity actually is. "I can do ~25 entries per 30-min session" implies a different threshold than "I can do 100." Tune to the practitioner, not to the corpus.

Document this in a comment on the constant.

### 4. No new migration needed

`knowledge_review_queue` already exists with the columns we need (`tenant_id`, `knowledge_item_id`, `review_type`, `status`, `notes`, `created_at`, etc.). Verify by reading `database/migrations/0016_knowledge_orchestrator.sql` for the exact column list before writing INSERTs — match the column names precisely.

If you find that `review_type` is constrained to a CHECK enum that doesn't yet include `'low_faithfulness'` (it might only have `'low_confidence'` and `'conflict'` per the original spec), add it via a small additive migration `0019_extend_review_type_enum.sql`. If the column is plain TEXT with no constraint, no migration needed.

## Hard constraints

- **Idempotent end-to-end.** Re-running both the post-load hook and the standalone script must not produce duplicate queue rows. The `NOT EXISTS` pattern handles this; verify it works.
- **Tenant safety.** Same `set_config('app.current_tenant_id', ...)` pattern as C.1.2/C.1.3/C.1.4.
- **No PHI.** Knowledge content only.
- **Backward compat.** Existing rows in `knowledge_review_queue` (zero today, but defensive) must not be touched.
- **Branch:** `feat/c15-autoflag-review-queue`. Draft PR. Don't merge.

## Verification before done

1. **Apply any new migration if you needed one** (likely not).
2. **Run the standalone script against the dev DB:**

   ```bash
   python services/analysis-engine/scripts/enqueue_review.py
   ```

3. **Verify queue state:**

   ```sql
   SELECT
     review_type,
     status,
     COUNT(*) AS n
   FROM knowledge_review_queue
   GROUP BY review_type, status
   ORDER BY review_type, status;
   ```

   Expected on this dev DB after the run:
   - `low_confidence | pending` → some N (probably 300-500 given the threshold + distribution)
   - `low_faithfulness | pending` → ~4 (the C.1.4 review-flagged entries from the integration test)
   - No other rows

4. **Idempotency check:** re-run the script. Verify the queue counts don't change (NOT EXISTS prevents duplicates).

5. **Spot-check a few queued rows:**

   ```sql
   SELECT q.review_type, q.notes, ck.title, ck.confidence_score, ck.faithfulness_score
   FROM knowledge_review_queue q
   JOIN clinical_knowledge ck ON ck.id = q.knowledge_item_id
   ORDER BY random()
   LIMIT 10;
   ```

   Eyeball: do the `notes` accurately describe why each entry was flagged? Do the scores actually fall below the threshold for `low_confidence` rows?

## Deliverable

- Modified: `services/analysis-engine/app/knowledge/db.py` (new `enqueue_review_items` function)
- Modified: `services/analysis-engine/scripts/load_knowledge.py` (post-load hook call)
- New: `services/analysis-engine/scripts/enqueue_review.py` (standalone script)
- Optional new migration: `database/migrations/0019_extend_review_type_enum.sql` only if the existing CHECK constraint blocks `'low_faithfulness'`
- Draft PR titled "C.1.5 — Auto-flag low-confidence and low-faithfulness entries to review queue"
- PR body includes: the threshold rationale, the verification queries' output, idempotency confirmation, and a one-line note on whether a new migration was needed.

When done, paste the verification output and the PR URL.
