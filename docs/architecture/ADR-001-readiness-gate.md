# ADR-001: Protocol Readiness Gate — Weights, Semantics, and Failure Modes

| | |
|---|---|
| **Status** | Proposed (pending Phase 2 clinical sign-off) |
| **Decision area** | `lib/readiness/readiness.ts` — the pure deterministic clinical-safety gate |
| **Supersedes** | None |
| **Authority** | PRD §5.1, §5.4, §6 Phase 2 |
| **Reviewers required** | Engineering lead, clinical lead, security lead |

---

## 1. Context

The Protocol Readiness Gate is the **only deterministic safety boundary** between the patient intake corpus and the LLM-generated clinical protocol. It runs on every call to `POST /api/patients/[id]/generate-protocol` (GATE-1) and decides three things in one step:

1. **`can_generate`** — may we call the LLM at all?
2. **`confidence_ceiling`** — if we do call it, what's the maximum confidence the output is allowed to claim?
3. **`blocking_gaps[] / non_blocking_gaps[]`** — what's missing, and which of those are show-stoppers?

The PRD prescribes the algorithm verbatim (§5.1). This ADR exists because the algorithm is short but its **semantics are not obvious from the code**, and because Phase 2 is one of two clinically-gated checkpoints in the entire build. A clinician signing off on a 30-line function needs to know *why* each branch is shaped the way it is, not just *what* it does. The weights, the AI-confirmation special case, and the way "low" ceiling collapses two different failure modes are all decisions that deserve explicit defense.

## 2. Decision

Implement the algorithm exactly as specified in PRD §5.1. The function is **pure, total, and side-effect-free**: same inputs always produce the same output, no exceptions thrown, no I/O. All persistence and audit logging happens at the call site (API-7 and API-8), never inside `readiness()`.

The function's signature is:

```ts
function readiness(checks: ReadinessCheck[]): ReadinessResult
```

Where `ReadinessCheck` is:

```ts
type ReadinessCheck = {
  key: string;                                              // stable identifier, e.g. "ai_confirmed"
  label: string;                                            // human-readable, used in gap lists
  weight: "Required" | "High" | "Medium" | "Required-for-high";
  met: boolean;
  detail?: string;                                          // optional: what specifically is missing
};
```

And `ReadinessResult` is the contract from §5.1:

```ts
type ReadinessResult = {
  readiness: "ready" | "partial" | "insufficient";
  confidence_ceiling: "high" | "moderate" | "low";
  blocking_gaps: string[];
  non_blocking_gaps: string[];
  can_generate: boolean;
};
```

The checks themselves are **assembled by the caller** (API-7) from patient state, document state, and AI confirmations. `readiness()` is the deterministic kernel; the assembly is where the impedance-mismatched real world meets the clean algorithm.

## 3. The Four Weight Classes — Rationale

The PRD specifies four weight tiers. Each one exists for a different clinical or operational reason:

### 3.1 `Required` — blocking gaps

A `Required` failure makes generation impossible. There are three checks at this weight: Step-1 intake complete, triggered deep dives answered, and safety flags reviewed. The common thread is that **the LLM cannot do useful clinical reasoning over absent data**, and pretending otherwise would produce confabulated output.

*Why three checks and not more*: every additional `Required` check is an additional way for the gate to block. Adding checks here is high-cost — it shifts work back to the patient or clinician. The bar for adding a `Required` is "clinical reasoning is impossible without this," not "it would be nice to have."

### 3.2 `High` — degrade ceiling, do not block

A `High` failure (medications without dose/duration; labs not present or waived) makes generation **possible but constrained**. We can still produce a foundational protocol; we just can't responsibly emit specific dosages or advanced-phase recommendations.

This is the tier where the system makes its single most important trade-off: rather than blocking the clinician, we **let them generate with reduced confidence**, surfacing exactly which gap caused the reduction. The PRD's degraded-confidence constraints (§5.4 / DC-1 through DC-5) are the mechanical enforcement of that trade-off.

### 3.3 `Medium` — degrade ceiling more leniently

The only `Medium` check is transcripts/notes attached and verified. The reasoning: transcript-level corroboration improves protocol quality but most patients can be safely protocoled without it during the foundational phase. A `Medium`-only gap permits `confidence_ceiling = "moderate"` (one notch above `"low"`), reflecting that the missing context is real but not severe.

### 3.4 `Required-for-high` — the AI confirmation special case

There is exactly one check at this weight: `ai_confirmed`. It is the most subtle weight in the system and deserves its own section (§4).

## 4. AI-Confirmation Semantics

### 4.1 Why `ai_confirmed` exists as a weight class of its own

Every datum in `intake_data` carries a provenance tag: `patient` (the patient typed it), `clinician` (the clinician typed or corrected it), or `ai` (the LLM inferred it from free text). Provenance matters because **AI-inferred data is a liability** until a clinician reviews and signs off on it. Per PRD §2.3 and the `intake-data.schema.ts` design, an `ai`-tagged field is unconfirmed by default and must be confirmed in `_ai_confirmations` before it is treated as authoritative.

The unique status of `ai_confirmed` is this: a system with **High and Medium gaps but with all AI fields confirmed** is *more* trustworthy than a system with **no High/Medium gaps but with unconfirmed AI fields**. The latter is operating on unverified inferences. The algorithm encodes this by making `ai_confirmed` the only check that can independently push the ceiling from `"moderate"` to `"low"`.

### 4.2 Why it's not just another `High`

Two reasons.

First, **AI confirmation is the only check whose status the patient cannot affect**. The patient can complete more intake, attach more labs, fill in dose details — but they cannot confirm AI inferences. Only a clinician can. Lumping it with `High` would hide that asymmetry.

Second, the readiness-gate consumers care about it specifically: `format-timeline-for-prompt.ts` (Phase 6.2 / DoD-10) *excludes* unconfirmed AI fields from the trusted-facts payload. That exclusion is a separate enforcement mechanism, but it works in concert with the ceiling: if unconfirmed AI exists, the prompt sees less data *and* is told its ceiling is lower. Defense in depth.

### 4.3 What it does NOT mean

`ai_confirmed` being met does **not** mean "all AI fields were correct." It means "a clinician viewed each AI field and either accepted or corrected it." A clinician who rubber-stamps AI fields without reading them is defeating the gate; this is a process risk the deterministic algorithm cannot catch and which the PRD assigns to the audit layer and clinician training. Audit rows on every confirmation (Phase 7.2) exist to make that pattern detectable in retrospect.

## 5. The Algorithm — Annotated

The implementation from §5.1, with commentary at each branch:

```ts
const blocking      = checks.filter(c => c.weight === "Required" && !c.met);
const highGaps      = checks.filter(c => c.weight === "High"     && !c.met);
const medGaps       = checks.filter(c => c.weight === "Medium"   && !c.met);
const aiUnconfirmed = !checks.find(c => c.key === "ai_confirmed")!.met;
```

The `aiUnconfirmed` line uses `!.met` — a non-null assertion. **The caller must guarantee an `ai_confirmed` check is always present in the input array, even when there are no AI fields.** When there are no AI fields, the check should be present with `met: true`. This is an invariant of API-7's assembly logic, tested in Phase 6.1.

```ts
const readiness =
  blocking.length > 0                                          ? "insufficient"
  : (highGaps.length + medGaps.length) === 0 && !aiUnconfirmed ? "ready"
  :                                                              "partial";
```

The middle branch is the strictest: **zero** High gaps, **zero** Medium gaps, **and** AI confirmed. Anything less is `"partial"` (or `"insufficient"` if blocked). `"ready"` is a high bar by design.

```ts
const confidence_ceiling =
  readiness === "insufficient"             ? "low"        // moot; cannot generate
  : readiness === "ready"                  ? "high"
  : (highGaps.length > 0 || aiUnconfirmed) ? "low"
  :                                          "moderate";  // only Medium gaps remain
```

Two observations:

1. **`"insufficient" → "low"` is a placeholder.** `can_generate` is false in this state so the ceiling is never consulted; we emit `"low"` for type completeness, not because it has semantic meaning. **Do not let downstream code use `confidence_ceiling` without first checking `can_generate`.** This is a foot-gun and should be tested explicitly (Phase 2 test matrix).

2. **`"low"` has two distinct causes** that the schema collapses: a High gap, or unconfirmed AI. Clinically these are different failures (a missing lab vs. an unverified inference) but the protocol-generation prompt treats them identically. This is a deliberate compression; see §7.3 for the rationale and an open question.

```ts
const can_generate = readiness !== "insufficient";
```

Single source of truth for "may we call the LLM." API-8 (GATE-1) re-runs `readiness()` server-side and refuses the LLM call on `can_generate === false` **regardless of any client-side state**.

## 6. Failure Modes the Algorithm Catches

These are the cases the gate is *designed* to prevent. They become the Phase 2 test matrix's positive cases.

| Scenario | Algorithm result | Why it matters |
|---|---|---|
| Patient submits Step 1 but never returns for Step 2 (triggered modules exist) | `insufficient`, `can_generate: false` | Triggered-deep-dives Required check fails |
| Clinician forgets to review a red-flag symptom flag | `insufficient`, `can_generate: false` | Safety-flags-reviewed Required check fails |
| All data present, but AI extracted "metformin 500mg BID" from a transcript and clinician hasn't confirmed | `partial`, ceiling `"low"` | Specifically the case where `aiUnconfirmed` is the *only* gap |
| Patient lists medications but no doses | `partial`, ceiling `"low"` | High gap drops the ceiling |
| Patient skipped labs (no waiver recorded) | `partial`, ceiling `"low"` | High gap |
| Transcript uploaded but not yet verified by clinician | `partial`, ceiling `"moderate"` | Medium gap; protocol generation allowed at moderate confidence |
| Everything green, AI fields confirmed | `ready`, ceiling `"high"` | Full-confidence protocol |
| Client app tries to force `can_generate=true` via API call | API-8 re-runs gate, refuses | Defense against client tampering |

## 7. Failure Modes the Algorithm Does NOT Catch

These are the edges where the gate is silent or surprising. **Each one needs either a documented mitigation or a clinical decision before Phase 2 can ship.**

### 7.1 Vacuous "triggered deep dives answered"

If Step 1 produces zero triggers (a healthy patient with no symptoms, no medications, no relevant lifestyle factors), the "triggered deep dives answered" check is trivially met — there's nothing to answer. The gate will allow generation.

**This is intentional and correct.** A patient with no clinical signals should be eligible for a foundational wellness protocol. But it should be documented loudly so that no one in code review later sees "trivially met" as a bug.

*Decision*: the check is met by an explicit `triggered_count === answered_count` comparison, where both are zero in the no-signal case. Not by absence of the check.

### 7.2 Friction-budget-suppressed augmented modules

`friction-budget.ts` can suppress augmented modules to stay within budget. Suppressed augmented modules are **never tracked by the readiness gate** because they were never required in the first place — the gate only counts deterministic ("must-fire") modules.

*Decision*: this is correct. The gate's "triggered deep dives answered" check counts only deterministic triggers (§5.2). Augmented modules are by definition nice-to-have; their suppression is a friction-budget concern, not a readiness concern.

*But*: the friction budget can never suppress a deterministic module (PRD §5.3 invariant). The Phase 2 test matrix must include a friction-budget × readiness interaction test confirming this. If a future change ever lets the budget suppress a deterministic module, the readiness gate would silently pass on missing data. **This invariant is load-bearing.**

### 7.3 The "low" ceiling collapses two failure modes

As noted in §5, `confidence_ceiling === "low"` can mean (a) at least one High gap, or (b) AI fields unconfirmed (with no High gaps), or (c) both. Downstream, the analysis prompt receives only the ceiling string, not the cause.

*Open question for clinical review*: does the protocol-generation prompt need to know *why* the ceiling is low? Argument for: a protocol where labs are missing should hedge differently than a protocol where the symptoms were AI-inferred from a transcript. Argument against: defense in depth — the prompt is told the ceiling, AND the unconfirmed AI fields are excluded from the trusted-facts payload, AND DC-1 through DC-5 enforce hedging regardless. Three layers may be enough.

*Provisional decision*: ship v1 with the current compression; revisit if clinical review of generated protocols shows the hedge language is wrong for one of the two paths. The `non_blocking_gaps[]` array already carries enough information to disambiguate if we decide to expose it.

### 7.4 The "reviewed" semantics for safety flags

PRD §5.6 defines red-flag symptoms (faintness, chest pain, severe weight loss) that surface as clinician-visible safety flags. The Required check is "safety flags reviewed." But what is "reviewed"?

*Decision*: a safety flag is reviewed when a clinician records a **disposition** for it — one of `acknowledge`, `refer`, or `resolve`. Each disposition is audit-logged. Mere viewing (the flag appears in the UI) is **not** review. This needs to be documented in the safety-flag schema (separate work, outside §5.1).

### 7.5 Lab waiver authorization

The High check is "labs present or **explicitly waived**." The waiver mechanism is not specified in §5.1.

*Decision*: lab waiver is a clinician-only action (not patient, not AI), is per-patient (not per-lab-panel), is audit-logged with a free-text reason, and is revocable. A waiver that exists makes the High check `met: true`. Implementation lives in API-6 (`prep-brief`) or a new endpoint, TBD in Phase 6.

### 7.6 Stale-data race condition

`readiness()` is pure but its inputs are a snapshot. Between API-7 returning `ready` and API-8 being called, the underlying data could change (a clinician unconfirms an AI field, a transcript gets re-flagged). API-8 mitigates this by **re-running `readiness()` server-side at generation time** (GATE-1). The UI's readiness widget is therefore advisory; the server-side re-check is authoritative.

*Decision*: this is correct. The readiness widget (Phase 7.3) must surface that it is advisory ("Last checked X seconds ago") to avoid clinician confusion when the generate call returns a different result than the widget showed.

### 7.7 Empty question bank for a triggered module

A deterministic module triggers but the LLM analysis fails (twice), and the static question bank for that module is somehow empty (data error). The "triggered deep dives answered" check would be vacuously met because there were no questions to answer.

*Decision*: this is a data-integrity bug, not a readiness concern. Phase 2's question-bank tests must assert that every deterministic module key has a non-empty fallback bank. If a bank is somehow empty at runtime, log loudly and flag the patient for manual review — but the readiness gate does the safest thing it can with the data it has.

### 7.8 Step-1 vs Step-2 completeness

The Required check is "Step-1 intake complete." If Step 2 was skipped because no triggers fired (§7.1), `intake_status` will be `step1_complete`, not `step2_complete`. The check should accept either.

*Decision*: the check is met when `intake_status` is one of `step1_complete | step2_complete | labs_pending | reviewed`. The check is **not** met when `intake_status` is `not_started`. Assembly in API-7 handles this; the readiness function only sees the boolean.

## 8. Consequences

### Positive

- **The clinical-safety boundary is a 30-line pure function**, trivially auditable and trivially testable. A clinician can read the algorithm in five minutes.
- **`can_generate` is the single source of truth.** No code path in the system bypasses it.
- **The gate is deterministic.** Re-running it on the same inputs always returns the same output; the clinician can trust what the widget says.
- **Defense in depth.** The ceiling constrains the prompt (DC-1 through DC-5), AND unconfirmed AI is excluded from trusted facts, AND output is post-validated. Even if one layer fails, the others hold.

### Negative

- **The "low" ceiling collapses two failure modes** (§7.3). If we discover this matters clinically, expanding to `low_high_gap` vs `low_ai_unconfirmed` is a schema change with downstream cost.
- **The gate is only as good as its check assembly.** API-7's job of turning patient state into a `ReadinessCheck[]` is where the bugs will live. The pure function is easy to test; the assembly logic has more surface area and harder edge cases.
- **The `ai_confirmed` check must always be present** in the input array (with `met: true` when there are no AI fields). This is a load-bearing invariant of the calling code; a missing check would crash the non-null assertion.

### Neutral

- **Three of the seven checks are Required.** This is a tight gate by design; if we find ourselves blocking patients more than expected, the conversation is "which Required should become High?" not "let's loosen the algorithm."

## 9. Open Questions Requiring Clinical Sign-off

These are the items I will not implement past Phase 2 without an explicit decision from the clinical lead:

1. **Should the "low" ceiling distinguish High-gap-low from AI-unconfirmed-low?** (See §7.3.) Provisional: no, ship the collapsed version. Decision needed before Phase 6.
2. **What disposition options should the safety-flag review accept?** (See §7.4.) Provisional: `acknowledge | refer | resolve`. Decision needed before Phase 4 (when safety flags are first surfaced).
3. **Who can waive labs, and what is the waiver-reason taxonomy?** (See §7.5.) Provisional: any clinician; free-text reason. Decision needed before Phase 6.
4. **Is `"ready"` too strict?** A patient with one minor unconfirmed AI inference (e.g., "patient seems to drink coffee daily" inferred from a transcript) gets `"partial"` and ceiling `"low"`. Is that the right behavior, or should there be a sub-class of low-risk AI inferences that don't gate? Provisional: keep strict, revisit after first 50 protocols.

## 10. Phase 2 Test Matrix Preview

The full test matrix is a separate artifact (next deliverable). The categories it must cover, derived from §6 and §7 of this ADR:

- All-met → `ready` / `"high"` / `can_generate: true`
- Required fail (each of the three, in isolation) → `insufficient` / `"low"` / `can_generate: false`
- Required + High fail → `insufficient` (Required dominates)
- High only (each of the two, in isolation) → `partial` / `"low"` / `can_generate: true`
- Medium only → `partial` / `"moderate"` / `can_generate: true`
- AI-unconfirmed only → `partial` / `"low"` / `can_generate: true`
- AI-unconfirmed + Medium → `partial` / `"low"` (AI dominates over Medium)
- High + Medium → `partial` / `"low"` (High dominates)
- Vacuous triggered-deep-dives (zero triggers, zero answered) → met
- Vacuous transcript-verified (zero transcripts uploaded) → met
- Missing `ai_confirmed` check in input → throws (invariant violation)
- `can_generate: false` + caller reads ceiling → must be caught by test that ceiling is gated behind `can_generate`
