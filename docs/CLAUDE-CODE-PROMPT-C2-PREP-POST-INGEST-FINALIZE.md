# Handoff prompt for Claude Code — C.2-prep: unified post-ingest finalize step

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Wire autotag + recompute + enqueue into a single post-ingest finalize step

This is C.2-prep from `docs/MVP-PRIORITIZATION-2026-05-08.md` Layer C — a precondition piece for C.2 (external leader ingestion). The goal: every new ingestion run lands with domains tagged, confidence scores computed, and review-queue entries created automatically — no manual script runs needed.

Foundation work merged: C.1.1 through C.1.5 (all five engineering items, schema + autotag + scoring + faithfulness check + auto-enqueue). Each was built as a one-shot script. C.2-prep wires them together so they happen as part of the live ingestion pipeline.

## Why this matters for C.2

We're about to start ingesting external leader content — Gottfried × *The Hormone Cure* first, then Cole × *Gut Feelings*, then 9+ more books across 6 leaders. Each ingestion currently leaves entries in an inconsistent state:

- `domains = '{}'` (autotag never ran)
- `confidence_score = 0.50` (default, never recomputed)
- `knowledge_review_queue` has no entries for the new content (enqueue runs only on manual trigger)

Without this wiring, every external leader ingestion requires the operator to run three scripts in sequence after `load_knowledge.py`. For 11+ books that's dozens of manual steps and many opportunities to forget one. Bundling them into a single post-load hook eliminates that operational fragility.

## Implementation

### 1. New library function: `post_ingest_finalize(conn, tenant_id) -> dict`

Add to `services/analysis-engine/app/knowledge/db.py`. Calls the three existing operations in the right order, returns a summary dict.

```python
def post_ingest_finalize(conn, tenant_id):
    """Run the standard post-ingestion sequence for a tenant.

    Order matters:
      1. Autotag domains on any new entries (domains = '{}')
      2. Recompute composite confidence_score for the entire tenant
         (a new entry can change corroboration counts for existing entries
         on the same topic — must be a tenant-wide recompute, not a delta)
      3. Enqueue low-confidence and low-faithfulness entries to review queue
         (idempotent NOT EXISTS pattern from C.1.5 already handles dedup)

    Returns summary dict for logging / verification.
    """
```

Each step calls the corresponding existing logic — don't reimplement. Likely structure:

- Step 1: import the autotag function (extract from `autotag_domains.py` if it's only inline in `main()` — refactor to a callable function, then `main()` is a thin CLI wrapper). Pass the tenant_id; only updates rows where `domains = '{}'`.
- Step 2: same pattern for `recompute_confidence.py` — extract the tenant-scoped recompute logic into a callable function.
- Step 3: call the existing `enqueue_review_items(conn, tenant_id)` from C.1.5.

### 2. Wire into `load_knowledge.py`

After the load completes successfully (all rows committed), replace the existing post-load `enqueue_review_items` call with a single `post_ingest_finalize(conn, tenant_id)` call. Print the returned summary.

The existing C.1.5 post-load hook becomes a no-op once this lands — it's now subsumed into the unified finalize step.

### 3. Refactor the three existing scripts

Each script's `main()` is currently a single function that does both DB connection + business logic. Split into:

- A pure callable function (e.g., `autotag_tenant(conn, tenant_id)`) that takes a connection and tenant_id, returns a count summary
- A `main()` CLI wrapper that opens the connection, iterates tenants, and calls the pure function

The standalone scripts (`autotag_domains.py`, `recompute_confidence.py`, `enqueue_review.py`) should still work as-is for one-off batch runs — only the *internals* are refactored.

This is a real refactor, not just import shuffling. Test that each standalone script still produces identical output to its current behavior on the dev DB.

### 4. Idempotency and ordering guarantees

Critical invariants the finalize step must preserve:

- **Idempotent end-to-end.** Re-running `post_ingest_finalize` on a tenant with no new entries should be a no-op (no new tags, no score changes since the formula is deterministic, no new queue rows since NOT EXISTS dedups).
- **Ordering matters.** Step 1 (autotag) must complete before step 2 (recompute) because the composite score considers domain-overlap for corroboration. Step 2 must complete before step 3 (enqueue) because enqueue reads the current confidence_score.
- **Per-tenant transaction boundary.** Wrap the three steps for a single tenant in one transaction if practical. If autotag fails mid-run, recompute and enqueue should not run on a partially-tagged corpus.

### 5. No new migration needed

This is purely application-layer wiring. All schema is already in place from migrations 0016-0019.

## Hard constraints

- **No behavior change to existing standalone scripts.** Their CLI interface and output stay identical. They become thinner — but a contractor running `python scripts/autotag_domains.py` should see the exact same logs and result counts as today.
- **Tenant safety.** Same `set_config('app.current_tenant_id', ...)` pattern.
- **No PHI.** Knowledge content only.
- **Idempotent.** Re-running on a clean state must be a true no-op.
- **Branch:** `feat/c2prep-post-ingest-finalize`. Draft PR. Don't merge.

## Verification before done

1. **Test the refactor preserves standalone behavior.**

   Run each standalone script against the dev DB. Compare output to a prior run (or do a `--dry-run` first to confirm no changes are pending; if changes are pending that's a bug — there shouldn't be unless the dev DB has drifted).

2. **Test the unified hook on synthetic input.**

   Either: (a) load a small JSONL file (the smallest in `database/seed/knowledge/`) and verify all three steps run + produce expected counts, OR (b) write a tiny test fixture — 5 fake clinical_knowledge rows inserted manually, then call `post_ingest_finalize` and assert each operation processed them.

3. **Idempotency test.**

   Run `post_ingest_finalize` twice in a row on a tenant. Second run should report all-zero counts (no tagged, no confidence changes, no enqueued).

4. **Verify the existing post-load enqueue hook is removed/replaced cleanly** — `grep -rn enqueue_review_items services/` should show usages only inside `post_ingest_finalize`, not as a standalone post-load call.

## Deliverable

- New function in `services/analysis-engine/app/knowledge/db.py`: `post_ingest_finalize`
- Refactored: `services/analysis-engine/scripts/autotag_domains.py` (extract callable, keep CLI)
- Refactored: `services/analysis-engine/scripts/recompute_confidence.py` (extract callable, keep CLI)
- Refactored: `services/analysis-engine/scripts/enqueue_review.py` (extract callable, keep CLI)
- Modified: `services/analysis-engine/scripts/load_knowledge.py` (replace existing post-load enqueue with `post_ingest_finalize` call)
- Draft PR titled "C.2-prep — Unified post-ingest finalize (autotag + recompute + enqueue)"
- PR body: verification output for all four checks above; before/after of the standalone script outputs to confirm no regression.

When done, paste the verification output and the PR URL. After this lands, we'll be ready to write the C.2-actual prompt (multi-leader ingestion support + the Gottfried run) once Dr. Laura confirms what format she has *The Hormone Cure* in.
