# KO investigation — extraction quality & conflict detection

## Question 1 — Extraction quality check

**What exists**

- Pipeline: `services/analysis-engine/scripts/ingest_knowledge.py` → JSONL → `scripts/load_knowledge.py` → `app/knowledge/db.py:insert_knowledge_item`.
- Extraction is single-shot per chunk (`ingest_knowledge.py:63-93`). The output contract in `prompts/knowledge_extraction_v1.md:45-75` does **not** request any per-entry confidence, faithfulness, or quality field.
- `insert_knowledge_item` (`app/knowledge/db.py:34-69`) writes `category, title, content, embedding, metadata, source_channel, source_chunk_hash`. It writes **none** of the new provenance/quality columns from migration 0016 (`leader_id`, `source_id`, `domains`, `review_status`, `confidence_score`, `corroboration_count`).
- Schema is in place: `database/migrations/0016_knowledge_orchestrator.sql:89-109` adds `confidence_score NUMERIC(3,2) DEFAULT 0.50` and `review_status TEXT DEFAULT 'unreviewed'`. The `knowledge_review_queue` table (lines 147-174) has a `low_confidence` review_type ready to use.
- `graph_extraction_v1.md:72-77` asks for a per-relationship `strength`, but it lives on edges in `clinical_relationships`, not on entries.

**What's missing**

1. No entry-vs-source faithfulness check — no second-pass call, no recall validator, no embedding-similarity check.
2. No per-entry confidence is computed at ingestion. Every loaded row gets the schema default of `0.50`.
3. Nothing inserts into `knowledge_review_queue`. `grep -rn knowledge_review_queue` across `services/` and `apps/` returns zero.
4. The composite formula in `docs/knowledge-orchestrator/knowledge-schema-design.md:259` (`source_authority × 0.3 + corroboration × 0.3 + recency × 0.1 + review_bonus × 0.3`) is unimplemented — none of the four factors are computed anywhere.

**Effort to build**

- **Faithfulness check — medium (1-3 days).** Second LLM call after `extract_chunk` scoring entry-vs-source recall; thread the score through JSONL into `confidence_score` on insert.
- **Composite confidence scoring — small (< 1 day).** SQL/Python `recompute_confidence` script: factors come from `knowledge_leaders` and a corroboration self-join over embeddings.
- **Auto-flag low confidence — small (< 1 day).** Trigger or post-load step inserting a `low_confidence` queue row when `confidence_score < threshold`.

## Question 2 — Conflict detection

**What exists**

- `knowledge_conflicts` table is fully defined: `migration 0016:115-141` with `topic`, `domains`, `positions JSONB`, `resolution_type`, etc.
- `knowledge_review_queue.review_type` includes `'conflict'` (line 152) and FK `conflict_id` (line 155) for routing conflicts to Dr. Laura.
- The schema design doc walks through an intended example (`knowledge-schema-design.md:286-290`).

**What's missing**

1. **No code writes to `knowledge_conflicts`.** `grep -rln knowledge_conflicts` across `services/`, `apps/`, `database/` returns only the migration and two design docs.
2. No detection heuristic. `build_graph.py` extracts typed relationships but never compares leaders' positions on the same concept.
3. **No UI in `apps/web/`** for viewing or resolving conflicts — same grep returns nothing under `apps/`.
4. `knowledge_leaders` is also unwritten by any code, so the `leader_id` FK needed to compare positions has no source data yet.

**Effort to build**

- **Detection heuristic v1 — medium (1-3 days).** Walk the graph: for each `(domain, target_concept)`, compare `relationship_type`/`strength` across `leader_id`s; flag direct contradictions (`treats` vs. `contraindicates`, opposing `precedes`) into `knowledge_conflicts`. Blocks on backfilling Slack entries to a "Dr. Laura" leader row first.
- **Embedding-based contradiction detection — large (> 3 days).** High-similarity entries with opposing recommendations need an LLM judge pass. Real evaluation work.
- **Dr. Laura conflict-resolution UI — medium (1-3 days).** New `/dashboard/knowledge/conflicts` page: pending rows side-by-side, resolution dropdown writing `resolution_type` + `resolution_text`. Mirrors the audit-log page style.
