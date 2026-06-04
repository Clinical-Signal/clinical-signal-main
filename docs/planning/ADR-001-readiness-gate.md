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

The Protocol Readiness Gate is the **only deterministic safety boundary** between the patient intake corpus and the LLM-generated clinical protocol. It runs on every call to `POST /api/patients/[id]/generate-protocol` (GATE-1) and decides three things in a single pure computation:

1. **`can_generate`** — may we call the LLM at all?
2. **`confidence_ceiling`** — if we do call it, what is the maximum confidence the output is allowed to claim?
3. **`blocking_gaps[] / non_blocking_gaps[]`** — what is missing, and which of those are show-stoppers?

The PRD prescribes the algorithm verbatim (§5.1). This ADR exists because the algorithm is short but its **semantics are not obvious from the code**, and because Phase 2 is one of two clinically-gated checkpoints in the entire build. A clinician signing off on a 30-line function needs to know *why* each branch is shaped the way it is, not just *what* it does. The weights, the AI-confirmation special case, and the way `"low"` collapses two distinct failure modes are all decisions that deserve explicit defense.

---

## 2. Decision

Implement the algorithm exactly as specified in PRD §5.1. The function is **pure, total, and side-effect-free**: same inputs always produce the same output, no exceptions thrown after the input-shape invariant is asserted, no I/O. All persistence and audit logging happens at the call site (API-7 and API-8), never inside `readiness()`.

The function's signature is:

```ts
function readiness(checks: ReadinessCheck[]): ReadinessResult
```

Where `ReadinessCheck` is:

```ts
type ReadinessCheck = {
  key: string;                                              // stable id, e.g. "ai_confirmed"
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

The checks themselves are **assembled by the caller** (API-7) from patient state, document state, and AI confirmations. `readiness()` is the deterministic kernel; the assembly is where the impedance-mismatched real world meets the clean algorithm. Tests for the assembly are explicitly out of Phase 2 scope (they require DB and request context); they live in Phase 6.1.

---

## 3. The Four Weight Classes — Rationale

The PRD specifies four weight tiers. Each one exists for a different clinical or operational reason.

### 3.1 `Required` — blocking gaps

A `Required` failure makes generation impossible. There are three checks at this weight:

| Key | Why it blocks |
|---|---|
| `step1_complete` | Without Step 1 there is no patient model at all; reasoning is impossible. |
| `triggered_deep_dives_answered` | If Step 1 triggered a deep dive (e.g., digestive symptoms unlocked `gut_deep_dive`) and the patient never answered it, the LLM has a known unknown in the exact area that matters. Confabulation risk is highest here. |
| `safety_flags_reviewed` | A red-flag symptom (e.g., chest pain) that no clinician has triaged is the textbook unsafe-to-protocol state. |

The common thread: **the LLM cannot do useful clinical reasoning over absent data**, and pretending otherwise would produce confabulated output.

*Why three checks and not more.* Every additional `Required` check is an additional way for the gate to block. Adding checks here is high-cost — it shifts work back to the patient or clinician. The bar for adding a `Required` is "clinical reasoning is impossible without this," not "it would be nice to have."

### 3.2 `High` — degrade ceiling, do not block

A `High` failure (medications listed without dose/duration; labs not present and not waived) makes generation **possible but constrained**. We can still produce a foundational protocol; we just cannot responsibly emit specific dosages or advanced-phase recommendations.

This is the tier where the system makes its single most important trade-off: rather than blocking the clinician, we **let them generate with a reduced ceiling**, surfacing exactly which gap caused the reduction. The PRD's degraded-confidence constraints (§5.4 / DC-1 through DC-5) are the mechanical enforcement of that trade-off downstream in the prompt and on output validation.

### 3.3 `Medium` — degrade ceiling more leniently

The only `Medium` check is `transcripts_verified`. The reasoning: transcript-level corroboration improves protocol quality but most patients can be safely protocoled without it during the foundational phase. A `Medium`-only gap permits `confidence_ceiling = "moderate"` (one notch above `"low"`), reflecting that the missing context is real but not severe.

### 3.4 `Required-for-high` — the AI-confirmation special case

There is exactly one check at this weight: `ai_confirmed`. It does not block generation, but unconfirmed AI fields alone are enough to push the ceiling to `"low"` — i.e., this check can drop the ceiling without a `High` gap being present. It is the most subtle weight in the system and gets its own section below.

---

## 4. AI-Confirmation Semantics

### 4.1 Why `ai_confirmed` exists as a weight class of its own

Every datum in `intake_data` carries a provenance tag: `patient` (the patient typed it), `clinician` (the clinician typed or corrected it), or `ai` (the LLM inferred it from free text or a transcript). Provenance matters because **AI-inferred data is a liability** until a clinician reviews and signs off on it. Per PRD §2.3 and the `intake-data.schema.ts` design, an `ai`-tagged field is unconfirmed by default and must be confirmed in `_ai_confirmations` before it is treated as authoritative.

The unique status of `ai_confirmed` is this: a system with **High and Medium gaps but with all AI fields confirmed** is *more* trustworthy than a system with **no High/Medium gaps but with unconfirmed AI fields**. The latter is operating on unverified inferences. The algorithm encodes that ordering by making `ai_confirmed` the only check that can independently push the ceiling from `"moderate"` to `"low"`.

### 4.2 Why it is not just another `High`

Two reasons.

First, **AI confirmation is the only check whose status the patient cannot affect**. The patient can complete more intake, attach more labs, fill in dose details — but they cannot confirm AI inferences. Only a clinician can. Lumping it with `High` would hide that asymmetry from anyone reading the code or the readiness widget.

Second, the readiness-gate consumers care about it specifically: `format-timeline-for-prompt.ts` (Phase 6.2 / DoD-10) *excludes* unconfirmed AI fields from the trusted-facts payload. That exclusion is a separate enforcement mechanism, but it works in concert with the ceiling: if unconfirmed AI exists, the prompt sees less data **and** is told its ceiling is lower. Defense in depth.

### 4.3 What it does NOT mean

`ai_confirmed` being met does **not** mean "all AI fields were correct." It means "a clinician viewed each AI field and either accepted or corrected it." A clinician who rubber-stamps AI fields without reading them is defeating the gate; this is a process risk the deterministic algorithm cannot catch and which the PRD assigns to the audit layer and clinician training. Audit rows on every confirmation (Phase 7.2) exist to make that pattern detectable in retrospect. See §7.6 for the mitigation question this raises.

---

## 5. The Algorithm — Annotated

The implementation from §5.1, with commentary at each branch.

```ts
const blocking      = checks.filter(c => c.weight === "Required" && !c.met);
const highGaps      = checks.filter(c => c.weight === "High"     && !c.met);
const medGaps       = checks.filter(c => c.weight === "Medium"   && !c.met);
const aiUnconfirmed = !checks.find(c => c.key === "ai_confirmed")!.met;
```

The `aiUnconfirmed` line uses `!.met` — a non-null assertion. **The caller must guarantee an `ai_confirmed` check is always present in the input array**, even when there are no AI fields. When there are no AI fields, the check should be present with `met: true`. This is an invariant of API-7's assembly logic, tested in Phase 6.1. The Phase 2 matrix includes a "missing `ai_confirmed`" negative test that asserts the function throws (rather than silently returning a bogus result).

```ts
const readiness =
  blocking.length > 0                                          ? "insufficient"
  : (highGaps.length + medGaps.length) === 0 && !aiUnconfirmed ? "ready"
  :                                                              "partial";
```

The middle branch is the strictest: **zero** High gaps, **zero** Medium gaps, **and** AI confirmed. Anything less is `"partial"` (or `"insufficient"` if blocked). `"ready"` is a high bar by design — see §7.7 for the open question about whether it should be loosened.

```ts
const confidence_ceiling =
  readiness === "insufficient"             ? "low"        // moot; cannot generate
  : readiness === "ready"                  ? "high"
  : (highGaps.length > 0 || aiUnconfirmed) ? "low"
  :                                          "moderate";  // only Medium gaps remain
```

Two observations:

1. **`"insufficient" → "low"` is a placeholder.** `can_generate` is `false` in this state so the ceiling is never consulted; we emit `"low"` for type completeness, not because it has semantic meaning. **Do not let downstream code consume `confidence_ceiling` without first checking `can_generate`.** This is a foot-gun and is tested explicitly in the Phase 2 matrix.

2. **`"low"` has two distinct causes** that the schema collapses: a High gap, or unconfirmed AI. Clinically these are different failures (a missing lab vs. an unverified inference) but the protocol-generation prompt treats them identically. This is a deliberate compression; see §7.3.

```ts
const can_generate = readiness !== "insufficient";
```

Single source of truth for "may we call the LLM." API-8 (GATE-1) re-runs `readiness()` server-side and refuses the LLM call on `can_generate === false` **regardless of any client-side state**.

---

## 6. Failure Modes the Algorithm Catches

These are the cases the gate is *designed* to prevent. They become the Phase 2 test matrix's positive cases.

| Scenario | Algorithm result | Why it matters |
|---|---|---|
| Patient submits Step 1 but never returns for Step 2 (triggered modules exist) | `insufficient`, `can_generate: false` | Triggered-deep-dives Required check fails |
| Clinician forgets to triage a red-flag symptom | `insufficient`, `can_generate: false` | Safety-flags-reviewed Required check fails |
| All data present, but AI extracted "metformin 500mg BID" from a transcript and the clinician has not confirmed | `partial`, ceiling `"low"` | The case where `aiUnconfirmed` is the **only** gap |
| Patient lists medications but no doses | `partial`, ceiling `"low"` | High gap drops the ceiling |
| Patient skipped labs (no waiver recorded) | `partial`, ceiling `"low"` | High gap |
| Transcript uploaded but not yet verified by clinician | `partial`, ceiling `"moderate"` | Medium gap; generation allowed at moderate confidence |
| Everything green, AI fields confirmed | `ready`, ceiling `"high"` | Full-confidence protocol |
| Client app tries to force `can_generate=true` via API call | API-8 re-runs gate, refuses | Defense against client tampering |

---

## 7. Failure Modes the Algorithm Does NOT Catch

These are the edges where the gate is silent or surprising. **Each one needs either a documented mitigation or a clinical decision before Phase 2 ships.**

### 7.1 Vacuous "triggered deep dives answered"

If Step 1 produces zero triggers (a healthy patient with no symptoms, no medications, no relevant lifestyle factors), the `triggered_deep_dives_answered` check is trivially met — there is nothing to answer. The gate will allow generation.

**This is intentional and correct.** A patient with no clinical signals should be eligible for a foundational wellness protocol. But it should be documented loudly so that nobody in code review later sees "trivially met" as a bug.

*Decision*: the check is met by an explicit `triggered_count === answered_count` comparison, where both are zero in the no-signal case. Not by absence of the check.

### 7.2 Friction-budget-suppressed augmented modules

`friction-budget.ts` can suppress augmented modules to stay within budget. Suppressed augmented modules are **never tracked by the readiness gate** because they were never required in the first place — the gate only counts deterministic ("must-fire") modules.

*Decision*: this is correct. The gate's `triggered_deep_dives_answered` check counts only deterministic triggers (§5.2). Augmented modules are by definition nice-to-have; their suppression is a friction-budget concern, not a readiness concern.

*But*: the friction budget can never suppress a deterministic module (PRD §5.3 invariant). The Phase 2 test matrix must include a friction-budget × readiness interaction test confirming this. If a future change ever lets the budget suppress a deterministic module, the readiness gate would silently pass on missing data. **This invariant is load-bearing across the entire system.**

### 7.3 The `"low"` ceiling collapses two failure modes

As noted in §5, `confidence_ceiling === "low"` can mean (a) at least one High gap, or (b) AI fields unconfirmed (with no High gaps), or (c) both. Downstream, the analysis prompt receives only the ceiling string, not the cause.

*Open question for clinical review*: does the protocol-generation prompt need to know *why* the ceiling is low? Argument for: a protocol where labs are missing should hedge differently than a protocol where the symptoms were AI-inferred from a transcript. Argument against: defense in depth — the prompt is told the ceiling, AND unconfirmed AI fields are excluded from the trusted-facts payload, AND DC-1 through DC-5 enforce hedging regardless. Three layers may be enough.

*Provisional decision*: ship v1 with the current compression; revisit if clinical review of generated protocols shows hedge language is wrong for one of the two paths. The `non_blocking_gaps[]` array already carries enough information to disambiguate if we later decide to expose it.

### 7.4 Safety-flag disposition vocabulary

The gate sees `safety_flags_reviewed` as a single boolean. The **assembly logic** that produces that boolean is where the disposition vocabulary lives.

*Provisional decision*: a safety flag is reviewed when it has a recorded disposition in `{ acknowledge | refer | resolve }`. Mere viewing does **not** count. The clinician must take an explicit action.

*Clinical decision needed*: confirm the disposition vocabulary before Phase 4 (when safety flags are first surfaced in the UI).

### 7.5 Lab waiver authorization

`labs_present_or_waived` accepts either "labs uploaded" or "labs explicitly waived." The waiver path needs an authorization and audit story the gate cannot enforce.

*Provisional decision*: any clinician on the patient's care team may waive labs; the waiver requires a free-text reason that is persisted to the audit log. The gate sees only the resulting boolean.

*Clinical decision needed*: confirm waiver authorization scope and whether the reason should be a free-text field or a closed vocabulary, before Phase 6.

### 7.6 Rubber-stamping AI confirmations

A clinician who batch-confirms AI fields without reading them defeats the `ai_confirmed` check (§4.3). The deterministic gate cannot detect this; it sees only the boolean.

*Decision*: Phase 2 does not block on this. The mitigation is a Phase 7 UX/audit decision — candidates include per-field minimum view time before "confirm" is enabled, or audit alerts on >K confirmations in <T seconds. Tracked here so it does not get lost.

### 7.7 Is `"ready"` too strict?

A patient with **one** minor unconfirmed AI inference (e.g., "patient seems to drink coffee daily" inferred from a transcript) gets `"partial"` and ceiling `"low"`. That feels heavy for a minor inference.

*Open question for clinical review*: should there be a sub-class of low-risk AI inferences that do not gate? Provisional: no — keep `"ready"` strict; revisit after the first 50 protocols generated in real use show whether this is annoying or correct.

---

## 8. Consequences

### Positive

- **Single deterministic kernel.** All readiness logic lives in one pure function. Tested exhaustively in Phase 2; reused by API-7 (read) and API-8 (gate).
- **The §5.3 invariant ("budget cannot suppress deterministic") composes with this gate** — if the invariant holds, the gate's `triggered_deep_dives_answered` check is sufficient. If it ever breaks, the gate's safety guarantee collapses silently. The cross-cutting test in Phase 2 catches this.
- **Defense in depth on AI confirmation**: the gate degrades the ceiling AND the prompt-formatter excludes unconfirmed fields. Either alone would be insufficient; together they constrain the LLM tightly.
- **Audit-friendly.** `blocking_gaps[]` and `non_blocking_gaps[]` are human-readable strings; they appear unchanged in the readiness widget, the audit log, and any error messages the clinician sees.

### Negative

- **Four weight classes are more conceptually expensive than three.** A reviewer encountering the system for the first time has to learn why `ai_confirmed` is special. This ADR is part of the cost of that decision.
- **The `"low"` collapse (§7.3) means the protocol prompt sees less context than it could.** If clinical review later shows hedge language is wrong, we will revisit.
- **The non-null assertion on `ai_confirmed`** introduces an invariant the caller must uphold. If API-7 ever forgets to include the check, the function throws. The Phase 6.1 assembly tests must cover this.

### Neutral

- **`"ready"` is a high bar.** Patients with a single unconfirmed minor AI inference will see `"partial"`. Whether that is too strict is §7.7's open question; the algorithm itself is unchanged either way.

---

## 9. Open Questions Requiring Clinical Sign-off

These are the items I will not implement past Phase 2 without an explicit decision from the clinical lead.

1. **Should the `"low"` ceiling distinguish High-gap-low from AI-unconfirmed-low?** (See §7.3.) *Provisional: no, ship the collapsed version.* Decision needed before Phase 6.
2. **What disposition options should the safety-flag review accept?** (See §7.4.) *Provisional: `acknowledge | refer | resolve`.* Decision needed before Phase 4.
3. **Who can waive labs, and what is the waiver-reason taxonomy?** (See §7.5.) *Provisional: any clinician; free-text reason.* Decision needed before Phase 6.
4. **Is `"ready"` too strict for minor unconfirmed AI inferences?** (See §7.7.) *Provisional: keep strict, revisit after first 50 protocols.*

A `"yes"` to question 1 forces a `confidence_ceiling_cause` field into the result type. A `"no"` to question 2 changes the assembly logic, not this function. A change to question 3 affects API behavior, not this function. A change to question 4 is a meaningful algorithmic change that requires re-running the Phase 2 matrix.

---

## 10. Phase 2 Test Matrix Preview

The full test matrix is a separate artifact (next deliverable). The categories it must cover, derived from §6 and §7 of this ADR:

- All-met → `ready` / `"high"` / `can_generate: true`
- Each Required-fail in isolation (×3) → `insufficient` / `"low"` / `can_generate: false`
- Required + High fail → `insufficient` (Required dominates)
- Each High in isolation (×2) → `partial` / `"low"` / `can_generate: true`
- Medium only → `partial` / `"moderate"` / `can_generate: true`
- AI-unconfirmed only → `partial` / `"low"` / `can_generate: true`
- AI-unconfirmed + Medium → `partial` / `"low"` (AI dominates over Medium)
- High + Medium → `partial` / `"low"` (High dominates)
- Vacuous triggered-deep-dives (zero triggers, zero answered) → met
- Vacuous transcripts-verified (zero transcripts uploaded) → met
- Missing `ai_confirmed` check in input → throws
- Cross-cutting: deterministic-module-not-budget-suppressed invariant holds end-to-end
- Sentinel: `can_generate: false` + caller reading ceiling → caught by linter/test

The matrix consolidates the above with the friction-budget and deterministic-trigger matrices into a single source of truth for Phase 2.
