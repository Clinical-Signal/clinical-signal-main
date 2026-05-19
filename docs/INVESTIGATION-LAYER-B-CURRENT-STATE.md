# Investigation: Layer B (Protect the moat) — Current State

**Created:** May 11, 2026 (Sunday morning, end of work block)
**Purpose:** Same as the A.3 investigation — verify Layer B items against current `origin/main` code rather than rely on stale entries from `ISSUES-FROM-REVIEW.md` (April 30).

## Headline finding

**At least 3 of 8 Layer B items are already done in current code.** Same pattern as A.3 — the prioritization doc was carrying entries that have since been addressed. Net: Layer B work shrinks from "the big quality lift, ~17-25 hours" to "a few targeted improvements, ~5-10 hours."

| # | Item | Verified state | Notes |
|---|---|---|---|
| B.1 | Post-generation safety validation pass | ✓ **DONE** | `lib/safety-validation.ts` (133 lines) runs a dedicated AI pass cross-checking supplements vs. medications, allergies, pregnancy, red flags, dose ceilings. Wired into `generate-protocol/route.ts:135` and `generate-from-analysis/route.ts:120`. Returns structured `SafetyWarning[]` + `passed` boolean + `summary`. Persisted in protocol metadata, surfaced in API response. |
| B.2 | Detect & handle output truncation | ✓ **DONE** | `lib/analysis.ts:231-284`. Uses `salvageOnTruncate: true`, sets `wasTruncated`, walks expected sections array, builds `missingSections` list, logs/flags accordingly. The exact behavior the original ISSUES-FROM-REVIEW recommended. |
| B.3 | Smarter document chunking | **PARTIAL** | `lib/intake-documents.ts:154` — `chunkText` still uses simple sentence-boundary split. No table-aware or structured-data-aware boundaries yet. There IS a `DOC_TEXT_CAP` truncation marker at `lib/analysis.ts:158` so docs aren't silently truncated, but the underlying chunking algorithm hasn't been upgraded. Still worth doing. |
| B.4 | Extraction quality validation | **OPEN** | `insertDocument` at `lib/intake-documents.ts:62` accepts extracted text without quality checks. Could be wired through the C.1.4 faithfulness check approach (LLM-based recall/precision/nuance scoring) but for intake-doc extractions. Worth a follow-up. |
| B.5 | Drug-interaction checklist in prep brief | ✓ **DONE** | `lib/prompts/prep_brief_v1.md:57-67` has a comprehensive "Drug-supplement interactions to check" section: Blood thinners (Warfarin/Eliquis/Plavix → fish oil/E/garlic/ginkgo/nattokinase), SSRIs/SNRIs → 5-HTP/St. John's Wort/SAMe, Statins → CoQ10/red yeast/grapefruit, Birth control → B vitamins/St. John's Wort. The exact "duplicate the protocol gen list into prep brief" the original recommended. |
| B.6 | Define explicit red-flag thresholds | **PARTIAL** | Prep brief prompt mentions red flags but in general terms ("any safety-relevant observations... red-flag symptoms that need conventional workup first"). No structured vital-sign / lab-value cutoffs. Worth a small prompt enhancement — list specific thresholds (e.g., "BP ≥ 180/110, fasting glucose > 250, hemoglobin < 7, etc."). |
| B.7 | Disclaimer audit | NEEDS CHECK | Earlier in session I found disclaimers exist in protocol detail page, client doc view, call deck view, email draft view, and `lib/protocol-outputs.ts`. Likely substantially done. Audit needed for: prep brief, intake review page, exported PDF, login page. |
| B.8 | SMART outcomes enforcement | NEEDS CHECK | `lib/prompts/protocol_generation_v1.md` would need to be read to see whether outcome specificity is enforced. Quick check pending. |

---

## What's actually open in Layer B

Trimmed from 8 items to ~3.5:

1. **B.3 (partial) — upgrade `chunkText` to be structured-data-aware.** Lab tables shouldn't be split mid-row. Implementation: detect table-like patterns (lines starting with column headers, repeated `|` or `\t` separators, numeric-heavy rows) and treat them as atomic chunks. ~4-6 hr.

2. **B.4 — extraction quality validation on `insertDocument`.** Add a faithfulness-style check (or simpler: minimum length, character distribution, language detection heuristic) and flag low-quality extractions for manual review. Could share the C.1.4 faithfulness-check approach. ~2-3 hr.

3. **B.6 (partial) — define explicit red-flag thresholds in prep brief prompt.** Add a structured list of conditions requiring conventional referral with concrete cutoffs. ~1-2 hr.

4. **B.7 (verify) — disclaimer audit.** Probably 80% done; needs a sweep of the surfaces I haven't verified. ~1 hr.

5. **B.8 (verify) — SMART outcomes enforcement.** Quick prompt-template read to confirm. If missing, ~1 hr to add.

**Total remaining Layer B work:** roughly 9-13 hours, vs. the original 17-25.

---

## Recommendation

When Ryan returns, update the prioritization doc the same way Layer A.3 was updated — mark B.1, B.2, B.5 as DONE, B.3/B.6 as partial-with-scope-reduced. Then write the 3-5 small handoff prompts for the actually-open items.

I'm not pre-writing the Layer B prompts in this Sunday work block because:
- The verification depth for B.7 and B.8 needs another quick code read I can do but is at the edge of useful Cowork time
- The prompts would be much smaller and simpler than the Layer D prompts — most are 30-min to 2-hr changes
- Better to verify the full Layer B state in a fresh session than rush prompts I'd need to revise

If the next Cowork session opens with "what's next on Layer B" — start by reading `lib/prompts/protocol_generation_v1.md` for B.8 verification and the disclaimer surfaces for B.7, then write 3-5 prompts based on actual gaps.

---

## Updated implication for prioritization doc rev 7

When you next update the prioritization doc:

- Replace the current Layer B table with the verified-state version above
- Note in revision history: "Rev 7 — verified Layer B against current code; B.1, B.2, B.5 already done. Remaining work shrinks from ~20 hrs to ~10 hrs."
- Cross-reference table: mark B.1, B.2, B.5 as DONE
- Adjust the Phase 1 quality-gate block: B.1 ✓ DONE, B.2 ✓ DONE (etc.) — the gates are met, not just planned
