# Handoff prompt for Claude Code — investigate KO extraction quality + conflict detection state

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

This is **research, not code changes.** The output is a written report so we can decide what to build in the next planning session.

---

## Background context

The Knowledge Orchestrator (KO) is the engine that builds the moat — see `CLAUDE.md` "The moat" section and `docs/MVP-PRIORITIZATION-2026-05-08.md` Layer C. Three workstreams:

- **C.1.a** — enrich the existing 1,217 Slack entries (auto-tag domains, score confidence, validate extraction quality)
- **C.1.b** — ingest Dr. Laura's queued content (course materials, transcripts, reference docs)
- **C.1.c** — ingest external leaders (Gottfried, Cole, Hyman, etc.)

The corrected mental model: Dr. Laura's source content is already trusted (it's her words). The system does the heavy lifting on extraction + tagging + quality checks. Dr. Laura's actual time goes to (a) spot-checking flagged low-confidence extractions and (b) resolving flagged conflicts between her positions and external leaders'. We need to know what of this the existing code already does vs. what we'd have to build.

## Read first for context

- `CLAUDE.md` — moat statement, project orientation
- `docs/knowledge-orchestrator/knowledge-schema-design.md` — the intended schema design (some of which is in migration 0016, some maybe not)
- `KNOWLEDGE_SOURCES.md` — current ingestion status
- `docs/knowledge-orchestrator/gut-dysbiosis-proof-of-concept.md` — what good extraction output looks like

## Question 1: Extraction quality check

**What I want to know:** does the current ingestion pipeline do any kind of entry-vs-source faithfulness check?

**Files to read:**
- `services/analysis-engine/scripts/ingest_knowledge.py`
- `services/analysis-engine/scripts/load_knowledge.py`
- `services/analysis-engine/scripts/build_graph.py`
- Any prompts they reference (probably in `services/analysis-engine/prompts/`)

**Specifically check:**
1. After extracting a knowledge entry from a source chunk, does the code do any comparison back to the source? (e.g., asks the model "does this entry preserve the key claims of the source?", computes embedding similarity between entry and source, runs a structural-faithfulness validator)
2. Is a `confidence_score` being computed at ingestion time? On what basis (source authority? entry length? extraction confidence from the model? something else)?
3. Are entries flagged for human review when confidence is low? Where does the flag live (a column on `clinical_knowledge`? an entry in `knowledge_review_queue`?)
4. Does the schema (migration 0016) actually include `confidence_score` and review-status columns on `clinical_knowledge`, or are those proposed-but-not-built?

## Question 2: Conflict detection

**What I want to know:** when an external leader's position conflicts with Dr. Laura's, does anything in the current code detect that and surface it?

**Files to read:**
- `database/migrations/0016_knowledge_orchestrator.sql` — full read, especially the `knowledge_conflicts` table definition
- `services/analysis-engine/scripts/build_graph.py`
- `services/analysis-engine/app/knowledge/` (if it exists)
- `apps/web/lib/` — anything that touches `knowledge_conflicts`

**Specifically check:**
1. Is there any code that writes to `knowledge_conflicts`, anywhere?
2. If yes — what's the detection heuristic? (e.g., same domain + same concept + opposing recommendation? Embedding-based contradiction detection? Manual flagging only?)
3. If no — the table is sitting empty waiting to be populated. That's fine, we just need to know.
4. Is there any UI in `apps/web/` for Dr. Laura to view or resolve conflicts? Or is it backend-only at this point?

## Output format

Write a short report — under 500 words total. Two sections, one per question. For each section:

- **What exists** — file + line references for what's actually in the code
- **What's missing** — concrete gaps relative to what the workflow needs
- **Rough effort to build the missing pieces** — small (< 1 day), medium (1-3 days), large (> 3 days), with one-line rationale

**Do not modify any code.** No PRs, no commits. This is scoping for the next planning session in Cowork. Save the report as `docs/KO-EXTRACTION-AND-CONFLICT-INVESTIGATION.md` and print its path so I can read it back in Cowork.
