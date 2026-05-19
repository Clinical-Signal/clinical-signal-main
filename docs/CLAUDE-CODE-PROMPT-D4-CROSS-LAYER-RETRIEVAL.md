# Handoff prompt for Claude Code — D.4 Cross-layer retrieval (Layer C + Layer D + conflict detection)

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: At protocol generation time, query both Layer C and Layer D, detect cross-layer conflicts, pass both to the model with provenance

Per `docs/LAYER-D-PRACTITIONER-EXTENSIBILITY.md` — "Retrieval logic" section. This is the moat-defining work — without it, Layer D content sits in the database but doesn't actually influence protocol generation. Tightly coupled to **C.3.3 (inline conflict surfacing)** which surfaces the detected conflicts in the protocol editor UI.

**Depends on:** D.1, D.2, D.3 merged. C.4.1 (KO retrieval logic for Layer C alone) — if not yet built, this PR effectively builds C.4.1 and D.4 together.

**Read first:**
- `docs/LAYER-D-PRACTITIONER-EXTENSIBILITY.md` — full retrieval logic walkthrough
- `apps/web/lib/analysis.ts` — current protocol-generation context-building code (where retrieval injection slots in)

## Implementation

### 1. New retrieval module — `apps/web/lib/knowledge-retrieval.ts`

Encapsulates the dual-layer retrieval:

```typescript
import { withTenant } from "./db";

export interface RetrievedEntry {
  id: string;
  title: string;
  content: string;
  source: "clinical_signal_core" | "practitioner_layer";
  domains: string[];
  // For Layer C entries:
  leader_name?: string;
  confidence_score?: number;
  // For Layer D entries:
  upload_filename?: string;
  faithfulness_score?: number;
}

export interface CrossLayerConflict {
  layer_c_entry_id: string;
  layer_d_entry_id: string;
  topic: string;
  layer_c_position: RetrievedEntry;
  layer_d_position: RetrievedEntry;
  prior_resolution?: "prefer_layer_c" | "prefer_layer_d" | "use_both" | "situational";
}

export async function retrieveForProtocol(args: {
  tenantId: string;
  practitionerId: string;
  patientContext: string;       // built from intake + symptoms + labs
  topK?: number;                // default 20 entries
}): Promise<{
  layerC: RetrievedEntry[];
  layerD: RetrievedEntry[];
  conflicts: CrossLayerConflict[];
}> {
  const { tenantId, practitionerId, patientContext, topK = 20 } = args;

  // 1. Generate embedding for patient context (use existing embedding logic)
  const embedding = await generateEmbedding(patientContext);

  // 2. Query Layer C (clinical_knowledge) — ranked by composite confidence_score + similarity
  const layerC = await withTenant(tenantId, async (c) => {
    const { rows } = await c.query<RetrievedEntry & { _score: number }>(
      `SELECT ck.id, ck.title, ck.content, ck.domains,
              kl.name AS leader_name,
              ck.confidence_score,
              'clinical_signal_core' AS source,
              (1 - (ck.embedding <=> $1)) * 0.7 + ck.confidence_score * 0.3 AS _score
         FROM clinical_knowledge ck
         LEFT JOIN knowledge_leaders kl ON kl.id = ck.leader_id
        WHERE ck.embedding IS NOT NULL
          AND ck.review_status != 'reviewed_rejected'
        ORDER BY _score DESC
        LIMIT $2`,
      [embedding, topK],
    );
    return rows;
  });

  // 3. Query Layer D (practitioner_knowledge) — for THIS practitioner only,
  //    ranked by similarity alone (everything's trusted equally)
  const layerD = await withTenant(tenantId, async (c) => {
    const { rows } = await c.query<RetrievedEntry>(
      `SELECT pk.id, pk.title, pk.content, pk.domains,
              pu.original_filename AS upload_filename,
              pk.faithfulness_score,
              'practitioner_layer' AS source
         FROM practitioner_knowledge pk
         LEFT JOIN practitioner_uploads pu ON pu.id = pk.upload_id
        WHERE pk.practitioner_id = $1
          AND pk.embedding IS NOT NULL
          AND (pk.faithfulness_score IS NULL OR pk.faithfulness_score >= 0.50)
        ORDER BY pk.embedding <=> $2
        LIMIT $3`,
      [practitionerId, embedding, topK],
    );
    return rows;
  });

  // 4. Cross-layer conflict detection
  const conflicts = await detectCrossLayerConflicts({
    tenantId,
    practitionerId,
    layerC,
    layerD,
  });

  return { layerC, layerD, conflicts };
}

async function detectCrossLayerConflicts(args: {
  tenantId: string;
  practitionerId: string;
  layerC: RetrievedEntry[];
  layerD: RetrievedEntry[];
}): Promise<CrossLayerConflict[]> {
  const { tenantId, practitionerId, layerC, layerD } = args;
  const conflicts: CrossLayerConflict[] = [];

  // Heuristic v1: same domain + high embedding similarity (cosine ≥ 0.80)
  // + opposing relationship_type in clinical_relationships (or just topic-level
  // disagreement detected via title/content overlap).
  //
  // For MVP, simpler: same domain + high similarity. Later iterations add LLM
  // judge for actual contradiction (deferred — see C.3.4).

  for (const cEntry of layerC) {
    for (const dEntry of layerD) {
      // Domain overlap check
      const domainOverlap = cEntry.domains.some((d) => dEntry.domains.includes(d));
      if (!domainOverlap) continue;

      // Similarity check — fetch via SQL since we already have the embeddings indexed
      const similarity = await computeSimilarity(cEntry.id, dEntry.id, tenantId);
      if (similarity < 0.80) continue;

      // Check prior resolution
      const prior = await withTenant(tenantId, async (c) => {
        const { rows } = await c.query<{ resolution: string }>(
          `SELECT resolution FROM practitioner_conflict_resolutions
            WHERE practitioner_id = $1
              AND layer_c_entry_id = $2
              AND layer_d_entry_id = $3
            LIMIT 1`,
          [practitionerId, cEntry.id, dEntry.id],
        );
        return rows[0]?.resolution;
      });

      conflicts.push({
        layer_c_entry_id: cEntry.id,
        layer_d_entry_id: dEntry.id,
        topic: cEntry.title, // simplistic — could be LLM-derived later
        layer_c_position: cEntry,
        layer_d_position: dEntry,
        prior_resolution: prior as any,
      });
    }
  }

  return conflicts;
}

// computeSimilarity helper queries pgvector for the cosine distance between two stored embeddings
// (saves recomputing — they're both in indexed columns)
```

### 2. Wire into `apps/web/lib/analysis.ts`

The protocol-generation flow currently builds context from intake + labs. Find where the system prompt is assembled (search for the system prompt template, probably around `formatTimelineForPrompt` per the investigation report). Add a call to `retrieveForProtocol` and inject the results.

The injection format:

```
## Knowledge context (Clinical Signal core)

The following entries from the curated Clinical Signal knowledge base
are relevant to this patient's case:

[Layer C entries — formatted as before, with leader citation:]

### KB-C1 · gut_health · Dr. Will Cole · confidence 0.78
[content...]
[Source: Cole *Gut Feelings*, ch. 3]

## Knowledge context (your private knowledge layer)

The following entries from YOUR uploaded methodology are relevant to
this patient's case:

[Layer D entries:]

### KB-D1 · gut_health · your upload "ProtocolTemplate-Gut.docx"
[content...]
[Source: your upload]

## Cross-layer conflicts detected

The following positions from Clinical Signal core and your private
layer appear to contradict for this patient. Both are presented; you
will resolve them in the protocol editor.

### Conflict 1 — Topic: SIBO sequencing
Clinical Signal core (Cole, Gut Feelings, ch. 5):
  > [Layer C content snippet]
Your layer (your upload "ProtocolTemplate-Gut.docx"):
  > [Layer D content snippet]
[Prior resolution: prefer your layer]   <-- if exists, applied silently
```

Conflicts where `prior_resolution` is set get applied silently — only the chosen position is included in the prompt context for the model. Conflicts without prior resolution get included as both positions; the C.3.3 work surfaces them in the editor for the practitioner to resolve.

### 3. Pass conflicts to the protocol output

The protocol-generation response needs to include the unresolved conflicts so the C.3.3 UI work can render them. Add a `conflicts` field to the protocol payload — array of CrossLayerConflict objects. Stored alongside the protocol (in `protocols` table or a related table — TBD based on existing schema).

C.3.3 UI work picks these up and renders them in the editor. If C.3.3 hasn't shipped yet, the conflicts payload sits unused (forward compatible).

## Hard constraints

- **Layer D queries MUST scope to this practitioner.** WHERE practitioner_id = $1, always. Add an integration test that fails if this is removed (per the cross-practitioner privacy invariant from D.1's verification).
- **Resolved conflicts are applied silently.** When `prior_resolution` exists, the prompt only sees the chosen position — model never sees the other side. This is per the design intent: practitioner makes the call once; system honors it.
- **Unresolved conflicts include BOTH positions in the prompt.** Model is told they're conflicts, gets both, can use both contextually but the practitioner makes the binding decision via C.3.3 UI.
- **TopK is per-layer, not total.** 20 from Layer C, 20 from Layer D, conflict detection over both sets. If practitioner has rich Layer D content, both layers contribute meaningfully.
- **Don't change existing protocol-generation behavior for practitioners with empty Layer D.** If `layerD.length === 0`, the prompt should look identical to today's (just Layer C entries). New section headers only appear when Layer D has content.
- **Branch:** `feat/d4-cross-layer-retrieval`. Draft PR. Don't merge.

## Verification

1. Apply (D.1 + D.2 + D.3 merged)
2. Test setup:
   - Practitioner A uploads a doc with content that contradicts Cole's Gut Feelings on SIBO sequencing (e.g., "address hormones before gut" — opposite of Cole's recommendation)
   - Wait for D.3 extraction to complete
3. Generate a protocol for one of Practitioner A's patients with GI symptoms
4. Inspect the prompt sent to the model (via the prompt-versioning telemetry from PR #172, or by adding temporary logging):
   - Should have both Layer C section (with Cole's entry) and Layer D section (with practitioner's entry)
   - Should have a conflicts section listing the contradiction
5. Verify the protocol payload includes the `conflicts` array
6. Cross-practitioner test (CRITICAL):
   - Practitioner A's protocol generation should pull only Practitioner A's Layer D
   - Practitioner B (same tenant, different practitioner) generating a protocol should pull only their own Layer D — never see A's content
   - Add a SQL-level check: `SELECT * FROM practitioner_knowledge WHERE practitioner_id = '<A>'` then explicitly try to retrieve in B's session — must return zero matching A's entries
7. Empty Layer D test: practitioner with zero uploads generates a protocol — prompt should look identical to pre-D.4 behavior (only Layer C section)
8. Resolved-conflict test:
   - Set `practitioner_conflict_resolutions` row manually for the conflict from step 2
   - Re-generate the protocol
   - Conflict should NOT appear in the conflicts payload (resolved silently)
   - Only the practitioner-preferred position should appear in the prompt context

## Deliverable

- New: `apps/web/lib/knowledge-retrieval.ts`
- Modified: `apps/web/lib/analysis.ts` — wire retrieval into the prompt-assembly path
- Modified: protocol payload (whichever schema/code holds it) — include conflicts array
- Draft PR titled "D.4 — Cross-layer retrieval with conflict detection (Layer C + Layer D)"
- PR body: verification output, prompt-snippet samples showing both layers and a conflict, cross-practitioner privacy test result

When done, paste the PR URL. After this merges, C.3.3 (inline conflict UI) and D.5 (management UI) can ship in parallel.
