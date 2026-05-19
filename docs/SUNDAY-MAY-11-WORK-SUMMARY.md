# Sunday May 11 work summary — what's ready when you're back

**Time:** ~3 hours of Cowork work while you hiked Camelback.
**Output:** 2 investigation reports + 10 ready-to-paste Claude Code handoff prompts.
**Code touched:** zero — everything is in `docs/`. No commits, no PRs, no merges.

---

## What's queued for Claude Code (in suggested execution order)

### Quick wins (Monday morning, ~2 hr total)

1. **Issue #166 finalization** (10 min) — `docs/CLAUDE-CODE-PROMPT-ISSUE-166-FINALIZATION.md`. Verify the Goals-removal edits in your working tree, branch, PR, merge. Closes a stale in-flight item.

2. **A.3.1 — outputs route ownership check** (30 min) — `docs/CLAUDE-CODE-PROMPT-A31-OUTPUTS-OWNERSHIP-CHECK.md`. Smallest security gap — one new helper, one route change, one test.

3. **A.3.6 — prep_brief partial index** (30 min) — `docs/CLAUDE-CODE-PROMPT-A36-PREP-BRIEF-PARTIAL-INDEX.md`. Five-line migration. Speeds up patient list page as data grows.

4. **C.1.6 — post-ingest finalize wiring** (half day) — `docs/CLAUDE-CODE-PROMPT-C2-PREP-POST-INGEST-FINALIZE.md`. Bundles autotag + recompute + enqueue into a single post-load hook. Ready when external-leader ingestion starts.

### Layer A.3 security work (Monday afternoon, ~3-4 hr)

5. **A.3.3 — magic byte validation on intake-docs** (1-2 hr) — `docs/CLAUDE-CODE-PROMPT-A33-INTAKE-DOCS-MAGIC-BYTES.md`. Closes the file-upload gap. Labs are already protected; this brings intake-docs to parity.

6. **A.3.4 — preferences sanitization** (2-3 hr) — `docs/CLAUDE-CODE-PROMPT-A34-PREFERENCES-SANITIZATION.md`. Three-layer defense (length limit, instruction-pattern detection, XML-wrapped prompt injection). Closes the practitioner-preferences prompt-injection vector.

### Layer D — per-practitioner extensibility (the moat work, sequential ~1.5-2.5 weeks)

Sequence matters — D.1 must merge before D.2, D.3 needs D.1+D.2 merged, etc.

7. **D.1 — schema migration** (1 day) — `docs/CLAUDE-CODE-PROMPT-D1-PRACTITIONER-KNOWLEDGE-SCHEMA.md`. Three new tables (uploads, knowledge, conflict resolutions). Foundation for everything else.

8. **D.2 — upload endpoint + S3 storage** (1-2 days) — `docs/CLAUDE-CODE-PROMPT-D2-PRACTITIONER-UPLOAD-ENDPOINT.md`. POST `/api/practitioner/uploads`, multipart, magic byte validated, file in S3, row in `practitioner_uploads`.

9. **D.3 — extraction pipeline** (1-2 days) — `docs/CLAUDE-CODE-PROMPT-D3-PRACTITIONER-EXTRACTION-PIPELINE.md`. Wires the upload → extract → score → store → finalize flow. Heavy reuse of C.1 foundation.

10. **D.4 — cross-layer retrieval (also absorbs C.4.1 + C.4.2)** (4-5 days) — `docs/CLAUDE-CODE-PROMPT-D4-CROSS-LAYER-RETRIEVAL.md`. Layer C + Layer D queries, conflict detection, prompt injection with provenance, conflict payload for the editor UI. **Investigation `docs/INVESTIGATION-C4-RETRIEVAL-INTEGRATION-DESIGN.md` recommends folding C.4.1 and C.4.2 into D.4** since they all touch the same module — see that doc for rationale.

11. **D.5 — Layer D management UI** (1-2 days) — `docs/CLAUDE-CODE-PROMPT-D5-PRACTITIONER-LAYER-MGMT-UI.md`. Dashboard pages for practitioners to upload, see status, view extracted entries, delete. Independent of D.4 — can ship in parallel.

---

## Investigation reports (read these for context, no action needed)

- **`docs/INVESTIGATION-LAYER-A3-SECURITY-GAPS.md`** — found that A.3.2 and A.3.5 are already done in current code. The prioritization doc was carrying stale entries from April 30 without verification. Saved you 2 PRs of unnecessary work.

- **`docs/INVESTIGATION-C4-RETRIEVAL-INTEGRATION-DESIGN.md`** — found that `searchKnowledgeBase` and `formatKbContext` already exist in `lib/analysis.ts`, plus the wiring through `runProtocolGeneration`. C.4 is an upgrade of existing scaffolding, not a greenfield build. Recommends folding C.4.1 + C.4.2 into D.4 since both touch the same retrieval module.

- **`docs/INVESTIGATION-LAYER-B-CURRENT-STATE.md`** — found that **B.1 (safety validation), B.2 (truncation detection), B.5 (drug-interaction checklist) are already DONE in current code.** B.3 and B.6 are partial. The prioritization doc was carrying ~17-25 hours of "Layer B work" that's actually closer to ~10 hours remaining. Did NOT pre-write Layer B prompts because the remaining items need one more verification pass on B.7 (disclaimer) and B.8 (SMART outcomes) before the prompts are accurate.

---

## Updated docs

- **`docs/MVP-PRIORITIZATION-2026-05-08.md`** — Layer A.3 table updated to reflect actual current state per the investigation. A.3.2 and A.3.5 marked DONE. Each open item references its corresponding handoff prompt file.

---

## What I deliberately did NOT do

Per the working principles in CLAUDE.md and our agreed Cowork-vs-Claude-Code rule:

- **No code changes.** Every code modification flows through Claude Code with you present.
- **No git operations.** No branches, no commits, no pushes, no PRs.
- **No `gh` commands.** Issue creation and PR opening are Claude Code tasks.
- **No execution of Claude Code prompts.** I drafted them; you paste them.
- **No security-principles section in CLAUDE.md** (per your call yesterday — HIPAA compliance is the framing).
- **No positioning options doc** (per your call — MVP > marketing).

---

## Recommended Monday-morning sequence

If you want to ship a lot of value fast:

```
1. Paste Issue #166 prompt → 10 min, closes stale item
2. Paste A.3.1 prompt → 30 min, closes one security gap
3. Paste A.3.6 prompt → 30 min, closes one infra item
4. Paste C.1.6 prompt → half day, completes Layer C foundation
5. AWS account (your task per your message) → half day
```

By end of Monday: 4 PRs merged, AWS provisioned, 1 in-progress engineering item, and Layer A is ~60% there.

If you want to start the moat work in parallel:

```
6. Paste D.1 prompt (after C.1.6 lands) → 1 day
7. Continue with D.2 → D.3 → D.4 → D.5 over the rest of the week
```

By end of week: Layer D fully shipped, Layer A close to done, ready for Layer B and C.2 ingestion to start.

---

Enjoy the rest of your Sunday. The doc work is durable — none of it depends on dev environment state, all of it survives across sessions, and the handoff prompts are self-contained so a contractor (or future you) can pick up the work without context.
