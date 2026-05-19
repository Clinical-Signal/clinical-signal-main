# Investigation: C.4 KO Prompt Integration — Current State and Design

**Created:** May 11, 2026 (Sunday morning)
**Purpose:** Document the actual state of knowledge-base retrieval in `lib/analysis.ts` post-PR-#172, identify what already exists vs. what C.4 actually needs to build, and propose how C.4 should compose with D.4 (cross-layer retrieval).

## Headline finding

**More scaffolding exists than the prioritization doc suggested.** The protocol-generation pipeline already calls `searchKnowledgeBase(tenantId, findings, limit=12)` and conditionally injects results into the prompt via `formatKbContext`. C.4 is not a greenfield build — it's an upgrade of existing retrieval logic.

What exists:
- Full-text-search-based retrieval against `clinical_knowledge`
- KB context formatter that prepends a "## Clinical Knowledge Base" section to the user prompt
- Wiring through `runProtocolGeneration` so KB context is automatically included

What needs upgrading for C.4:
- Retrieval is full-text search, not embedding-based — misses semantic similarity
- No awareness of `knowledge_leaders`, `confidence_score`, `domains` (all post-0016 schema additions)
- No domain filtering — returns 12 entries regardless of patient relevance
- No citation tracking through to the protocol output JSON (per C.4.3)

What needs to be added when D.4 (Layer D + cross-layer) lands:
- Query `practitioner_knowledge` for the practitioner-scoped Layer D entries
- Cross-layer conflict detection
- Inline conflict surfacing payload for C.3.3 UI

**Implication:** C.4.1 (retrieval upgrade) and D.4 (cross-layer retrieval) should be done together as one piece of work, not split across two PRs that touch the same module. The D.4 handoff prompt at `docs/CLAUDE-CODE-PROMPT-D4-CROSS-LAYER-RETRIEVAL.md` already encompasses this. **Recommend collapsing C.4.1 into D.4.**

---

## Current code (origin/main, post-PR-#172)

### Retrieval function — `apps/web/lib/analysis.ts:485`

```typescript
export async function searchKnowledgeBase(
  tenantId: string,
  findings: Record<string, unknown>,
  limit: number = 12,
): Promise<Array<Record<string, unknown>>> {
  const query = buildSearchQuery(findings);
  if (!query) return [];

  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{...}>(
      `SELECT id, category, title, content, metadata, source_channel,
              ts_rank_cd(
                to_tsvector('english', title || ' ' || content || ' ' || COALESCE(metadata->>'clinical_reasoning', '')),
                to_tsquery('english', $1)
              ) AS rank
         FROM clinical_knowledge
        WHERE to_tsvector('english', title || ' ' || content || ' ' || COALESCE(metadata->>'clinical_reasoning', ''))
              @@ to_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2`,
      [query, limit],
    );
    return rows.map(...);
  });
}
```

**Gaps relative to what we now have in the schema:**

1. Doesn't `JOIN knowledge_leaders` — so leader name, authority_domains, is_internal are all unavailable
2. Doesn't filter or weight by `confidence_score` (added in migration 0016 + populated by C.1.3)
3. Doesn't filter by `domains` — even though we auto-tagged all 1,144 entries (C.1.2)
4. Doesn't filter by `review_status` — could surface entries flagged as `reviewed_rejected`
5. Doesn't filter by `faithfulness_score` — could surface entries the C.1.4 check flagged as low-quality (anything < 0.50 should be rejected; 0.50-0.75 is borderline)
6. Uses keyword full-text search only — `clinical_knowledge.embedding` (pgvector) is unused

### KB context formatter — `apps/web/lib/analysis.ts:304`

```typescript
function formatKbContext(items: Array<Record<string, unknown>>): string {
  const lines: string[] = [
    "## Clinical Knowledge Base",
    "",
    "The following items come from Dr. Laura DeCesaris's functional-medicine",
    "mentorship corpus. Incorporate their clinical reasoning where appropriate.",
    "",
  ];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    lines.push(`### KB-${i + 1} · ${it.category ?? "other"} · ${it.source_channel ?? "?"}`);
    lines.push(`**${it.title ?? ""}**`);
    lines.push(String(it.content ?? ""));
    ...
  }
  return lines.join("\n");
}
```

**Gaps:**

1. The intro says "Dr. Laura DeCesaris's functional-medicine mentorship corpus" — accurate today (only Dr. Laura's content) but breaks once external leaders ingest. Needs to be aware of `leader_name`.
2. The KB-N header uses `category` and `source_channel` — both Layer-1-Slack-era fields. Needs to surface `leader_name` and `confidence_score` instead (or alongside).
3. No citation format that the model can repeat back in the protocol output (per C.4.3 — "this recommendation cites [source]").
4. No section split between Layer C (curated core) and Layer D (practitioner's own) — needed for C.3.3 conflict-surfacing UX.

### Wiring — `apps/web/lib/analysis.ts:209` (runProtocolGeneration)

```typescript
export async function runProtocolGeneration(
  findings: Record<string, unknown>,
  kbContext?: Array<Record<string, unknown>>,
  onProgress?: () => void,
): Promise<{...}> {
  let userContent = "...";
  if (kbContext && kbContext.length > 0) {
    userContent += "\n\n" + formatKbContext(kbContext);
  }
  ...
}
```

This is fine as-is. KB context is already optional + automatically injected. The change for C.4/D.4 is what gets passed in via `kbContext` — the *contents* change, not the *wiring*.

---

## What C.4 actually needs to build

Restructured from the original C.4.1-C.4.4 list given the existing scaffolding:

### Recommended scope: C.4 + D.4 as a single combined PR

Since both touch `lib/analysis.ts`'s retrieval path, and the upgraded retrieval shape needs to handle Layer D from day one, do them together. **Use the D.4 handoff prompt** (`docs/CLAUDE-CODE-PROMPT-D4-CROSS-LAYER-RETRIEVAL.md`) as the authoritative spec — it already covers everything below.

| Old item | What to do | Where it lives now |
|---|---|---|
| C.4.1 — retrieval logic | Replace `searchKnowledgeBase` with a `retrieveForProtocol` that queries Layer C + Layer D, ranks, dedupes, filters by domain. | Subsumed into D.4 |
| C.4.2 — prompt injection | Update `formatKbContext` to render Layer C + Layer D sections separately, include leader citations, conflict section. | Subsumed into D.4 |
| C.4.3 — citation surfacing in output | Update protocol-generation prompt template (`lib/prompts/protocol_generation_v1.md`) to require the model to cite sources for each major recommendation. Update protocol output schema to include a `citations` array. | Mostly D.4 + a small prompt-template tweak |
| C.4.4 — regression check | Manual eyeball test: same patient before vs. after, structural equivalence + meaningful difference where Layer D content should change recommendations. | Same pattern as PR #172 verification |

### Specific upgrades inside D.4's `retrieveForProtocol` work

The D.4 prompt mentions these but worth restating for clarity:

1. **Embedding-based retrieval (not just full-text).** Use pgvector cosine similarity against the patient context embedding. Keep full-text as a fallback or a weighted contributor. The current full-text-only approach misses entries that don't share keywords with the query.

2. **JOIN knowledge_leaders.** Every Layer C result should carry `leader_name`, `is_internal`, `authority_domains`. Used for citation rendering and for ranking (entries from leaders authoritative on the relevant domain rank higher).

3. **Filter by review_status and faithfulness_score.** Exclude `review_status = 'reviewed_rejected'`. Exclude `faithfulness_score < 0.50`. (Per C.1.4 design: 0.50-0.75 is review-flagged but still usable; below 0.50 was rejected at insert time, so this is belt-and-suspenders defense.)

4. **Domain filtering as a soft signal.** If patient findings imply gut + hormones, prefer entries tagged with those domains. Don't hard-exclude other domains — sometimes a foundational entry from another domain is relevant. Use as a ranking boost.

5. **Composite ranking formula.** Suggested:

   ```
   score = (similarity * 0.5)
         + (confidence_score * 0.2)
         + (domain_match_boost * 0.2)
         + (recency_boost * 0.1)
   ```

   Where `similarity` is the cosine similarity from embedding match, `confidence_score` is the C.1.3 composite, `domain_match_boost` is 1.0 if the entry's domains intersect the inferred patient domains (else 0.0), and `recency_boost` is a recency curve from `created_at`.

6. **TopK per layer, not total.** Per D.4: 20 from Layer C, 20 from Layer D. Conflict detection over the union.

### The protocol output schema change

Current protocol JSON shape (per the existing `expectedClinicalKeys` array around line 244):

```json
{
  "title": "...",
  "clinical_protocol": {
    "systems_analysis": "...",
    "daily_protocol": "...",
    "supplement_protocol": "...",
    "dietary_recommendations": "...",
    "lifestyle_recommendations": "...",
    "clinical_reasoning": "...",
    "safety_review": "..."
  },
  "client_action_plan": {
    "intro": "...",
    "layers": [...],
    "disclaimer": "..."
  }
}
```

Add for C.4.3:

```json
{
  "title": "...",
  "clinical_protocol": { ... },
  "client_action_plan": { ... },
  "citations": [
    {
      "ref_id": "C1",
      "source": "clinical_signal_core",
      "leader_name": "Dr. Will Cole",
      "title": "Gut Feelings, Ch. 3",
      "knowledge_entry_id": "uuid-here"
    },
    {
      "ref_id": "D1",
      "source": "practitioner_layer",
      "upload_filename": "ProtocolTemplate-Gut.docx",
      "knowledge_entry_id": "uuid-here"
    }
  ],
  "conflicts": [...]   // per D.4
}
```

The protocol-generation prompt template (`lib/prompts/protocol_generation_v1.md`) needs a small update: tell the model to reference citations using `[ref_id]` notation in the clinical reasoning section, then the JSON schema requires the citations array. The existing telemetry (prompt_hash) will catch the prompt change automatically.

---

## What's NOT in C.4 (deferred or out of scope)

- **Embedding-based contradiction detection (C.3.4).** Already deferred to iteration 2 per C.3 design. Heuristic conflict detection in D.4 is sufficient for MVP.
- **Re-ranking by per-practitioner historical preference.** "Dr. Laura always picks the Gottfried position when there's a hormone conflict" — that's a learning loop, not MVP. Once `practitioner_conflict_resolutions` has data, future iterations could use it for re-ranking.
- **Citation extraction from existing protocols.** Old protocols don't have a citations array. Don't backfill — just start including it on new protocols going forward.
- **UI for browsing the knowledge base** — practitioners can't currently search/explore the curated KB. Future feature, not MVP.

---

## Recommended PR sequence for the C.4/D.4 combined work

1. **D.1** (schema for Layer D) — already has handoff prompt
2. **D.2** (upload endpoint) — already has handoff prompt
3. **D.3** (extraction pipeline) — already has handoff prompt
4. **D.4 expanded** (cross-layer retrieval AND the C.4 retrieval upgrade) — single PR; the D.4 handoff prompt is the authoritative spec
5. **D.5** (Layer D management UI) — independent of D.4
6. **C.4.3 — citation in protocol output** — small follow-up: tweak `protocol_generation_v1.md` to require `[ref_id]` citations + add `citations` field to JSON schema. Could be folded into D.4 if the PR isn't too big.
7. **C.3.3 (inline conflict UI in protocol editor)** — depends on D.4's `conflicts` payload existing

After this sequence: Layer D fully operational, cross-layer retrieval working, citations in protocols, conflict surfacing in the editor.

## Action items for the prioritization doc

When Ryan is back, update `docs/MVP-PRIORITIZATION-2026-05-08.md`:

- Layer C.4 table (post-Layer D): note that C.4.1 + C.4.2 are absorbed into D.4. Keep C.4.3 (citation surfacing) and C.4.4 (regression check) as separate items.
- Cross-reference table: C.4.1 → D.4 (combined), C.4.2 → D.4 (combined)
- Recompute Layer D effort: D.4 is now bigger because it absorbs C.4.1 + C.4.2 — call it 4-5 days instead of 1-2.
