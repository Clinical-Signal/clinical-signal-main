# Handoff prompt for Claude Code — C.1.2 Auto-tag domains on existing entries

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Auto-tag knowledge domains on the 1,144 existing clinical_knowledge entries

This is C.1.2 from `docs/MVP-PRIORITIZATION-2026-05-08.md` Layer C. Foundation work that gates external leader ingestion. C.1.1 (seed leaders + domains + backfill leader_id) is already done — verified counts in the dev DB.

## Context

`clinical_knowledge.domains` is a `TEXT[]` column (added by migration 0016). Currently empty (default `'{}'`) on all 1,144 rows. Each entry should be tagged with one or more of the six domain slugs we seeded:

- `gut_health`
- `hormones`
- `sleep`
- `metabolism`
- `nervous_system`
- `foundational`

These are defined in the `knowledge_domains` table — query it for the canonical list and descriptions:

```sql
SELECT slug, name, description FROM knowledge_domains ORDER BY sort_order;
```

## Strategy: channel-as-prior + LLM for ambiguous

Many entries have a `source_channel` that maps almost 1:1 to a domain (their original Slack channel name). Use channel as a strong prior to avoid LLM cost where it's unnecessary, then fall back to LLM classification for entries where channel is ambiguous or missing.

**Channel → domain mapping (high confidence, no LLM needed):**

| source_channel | tag with domain(s) |
|---|---|
| `gut-health` | `gut_health` |
| `hormones`, `hormoneai` | `hormones` |
| `sleep` | `sleep` |
| `metabolic-health-and-blood-sugar`, `fat-loss-and-metabolism` | `metabolism` |
| `nervoussystemregulation`, `mindset` | `nervous_system` |
| `nutrition-and-meal-planning`, `fitness-and-exercise`, `biohacking_and_longevity` | `foundational` |
| `supplements`, `serum_testing`, `detox`, `protocols` | LLM (cross-cutting — could be any domain depending on content) |
| `clientfeedbackrequests`, `case-studies`, `chronicdisease`, `coachingskills` | LLM (cross-cutting) |
| `skin`, `fertility`, `brain-health`, `peptides`, `plant-medicine` | LLM (these are topics, not 1:1 with our 6 domains — entries likely span multiple) |
| `livecallschedule-topics`, `call_replays`, `booksandresources`, `products-and-brands-we-love` | LLM (mixed) |

For entries with `source_channel IS NULL` (if any after our 100% backfill — should be zero, but check): LLM.

## Implementation

Write a Python script at `services/analysis-engine/scripts/autotag_domains.py` that:

1. Connects to the same DB the analysis engine uses (read `DATABASE_URL` from env)
2. Pulls each row from `clinical_knowledge` where `domains = '{}'` (empty array, not NULL — column has `DEFAULT '{}'`)
3. For each row:
   - Look up the channel in the mapping above. If matched, set `domains` to that single-element array directly.
   - If not matched (cross-cutting or unmapped): call Claude to classify. Use a tight prompt that returns just a JSON array of 1-3 domain slugs from the 6-slug enum, no prose. Use the existing LLM client wrapper if convenient (post-PR-#172 it should be `services/analysis-engine/app/...`).
4. Batch the UPDATE statements (one transaction per ~50 rows, not per row, for performance)
5. Print progress as it goes, and a final summary: total entries processed, broken down by classification source (channel-mapped vs. LLM-classified) and by domain.

For the LLM prompt, something like:

```
You are tagging functional-health knowledge entries with domain labels.

Available domain slugs (use ONLY these, no others):
- gut_health
- hormones
- sleep
- metabolism
- nervous_system
- foundational

For the following knowledge entry, return a JSON array of 1-3 domain slugs that best apply. If the entry is cross-cutting, include all that genuinely apply. Return only the JSON array, no prose.

Title: {title}
Category: {category}
Content: {content[:1500]}
```

Save the prompt as `services/analysis-engine/prompts/domain_classification_v1.md` per the project convention (PR #172 externalized prompts).

## Hard constraints

- **Idempotent.** Re-running the script should be safe — only updates rows where `domains = '{}'`.
- **No behavior change to existing pipelines.** This script is one-shot, doesn't modify `ingest_knowledge.py` or `load_knowledge.py`. (Wiring auto-tagging into new ingestions is a separate item — part of C.1.4 faithfulness check work.)
- **Sanity-check the LLM output** — reject any returned slug that isn't in the 6-slug enum. Log and skip the row if classification fails.
- **Tenant safety.** The DB connection should respect tenant scoping. Easiest: connect as the `clinical_signal` superuser (same as the migration), since this is admin tooling, not app traffic.
- **No PHI.** `clinical_knowledge` is not PHI — these are general knowledge entries. Safe to send to the LLM.
- **Work on a branch** (`feat/c12-autotag-domains`). Open a draft PR when done. Do not merge to main.

## Verification before done

Run from `psql`:

```sql
SELECT
  COUNT(*) FILTER (WHERE domains = '{}') AS still_untagged,
  COUNT(*) FILTER (WHERE array_length(domains, 1) = 1) AS single_domain,
  COUNT(*) FILTER (WHERE array_length(domains, 1) > 1) AS multi_domain,
  COUNT(*) AS total
FROM clinical_knowledge;
```

Expected after a clean run: `still_untagged = 0`, others sum to 1,144.

Spot-check 10 random rows per domain:

```sql
SELECT id, source_channel, category, title, domains
FROM clinical_knowledge
WHERE 'hormones' = ANY(domains)
ORDER BY random()
LIMIT 10;
```

Eyeball: do the titles plausibly belong to that domain? If anything looks miscategorized, note it in the PR description.

## Deliverable

- Script at `services/analysis-engine/scripts/autotag_domains.py`
- Prompt at `services/analysis-engine/prompts/domain_classification_v1.md`
- Updated `clinical_knowledge.domains` for all 1,144 rows
- Draft PR titled "C.1.2 — Auto-tag knowledge domains on existing 1,144 entries" with the verification query results pasted in the description

When you're done, print the verification query output and the PR URL.
