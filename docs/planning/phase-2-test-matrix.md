# Phase 2 Test Matrix — Clinical-Logic Core

| | |
|---|---|
| **Status** | Proposed (pending Phase 2 clinical sign-off) |
| **Scope** | `lib/readiness/readiness.ts`, `lib/intake/friction-budget.ts`, `lib/intake/deterministic-triggers.ts` |
| **Authority** | PRD §5.1, §5.2, §5.3 · ADR-001 · question-plan schema design §3 |
| **Consumed by** | Cursor (TDD prompts), clinical reviewer (Phase 2 sign-off) |

---

## 0. How to Use This Document

This is the **single source of truth** for what Phase 2 verifies. Three rules:

1. **Every row in §3, §4, §5 maps to one named test.** The test name is the row's ID (e.g., `RG-01`). One assertion per row where feasible; multi-assertion rows are flagged with `+` (e.g., `RG-01+`).
2. **No test goes into Phase 2 that isn't in this matrix.** If you find yourself wanting one, add it here first — that's how this stays a source of truth.
3. **Three rows are clinically load-bearing** and marked **🏥**. They are the ones the clinical reviewer signs off on personally; the rest are engineering hygiene around them.

### 0.1 Test ID conventions

| Prefix | File under test | Notes |
|---|---|---|
| `RG-` | `readiness.ts` | Readiness Gate |
| `FB-` | `friction-budget.ts` | Friction Budget |
| `DT-` | `deterministic-triggers.ts` | Deterministic Triggers |
| `XC-` | cross-cutting | Tests that exercise two or more of the above together |
| `INV-` | property/invariant | Property-based tests; run against many random inputs |

### 0.2 Input notation for the Readiness Gate

The gate takes a `ReadinessCheck[]`. Seven check keys exist; we abbreviate them:

| Abbr | Check key | Weight |
|---|---|---|
| **R1** | `step1_complete` | Required |
| **R2** | `triggered_deep_dives_answered` | Required |
| **R3** | `safety_flags_reviewed` | Required |
| **H1** | `medications_detailed` | High |
| **H2** | `labs_present_or_waived` | High |
| **M1** | `transcripts_verified` | Medium |
| **AI** | `ai_confirmed` | Required-for-high |

A row inputs column reads `R1 R2 R3 H1 H2 M1 AI` left-to-right with `✓` (met) or `✗` (unmet). `✓✓✓✓✓✓✓` is all-met. `✓✓✓✗✓✓✓` is "H1 unmet, all others met."

### 0.3 Input notation for Friction Budget

A row inputs column describes the module list as `<count><class>(<must>M+<nice>N)`, comma-separated:
- `3D(3M+2N)` = 3 deterministic modules, each with 3 must-have + 2 nice-to-have questions
- `5A(1M+2N)` = 5 augmented modules, each with 1 must-have + 2 nice-to-have
- `2D(3M+0N), 3A(2M+3N)` = mixed

Budget config defaults: `max_augmented_modules=4, max_questions_per_module=6, max_total_augmented_questions=18`. Overrides are noted inline.

### 0.4 Input notation for Deterministic Triggers

Step-1 signals are abbreviated:
- `dig` — digestive symptoms
- `hor` — hormonal symptoms
- `aut` — autoimmune
- `med` — medications/supplements listed (count noted if relevant)
- `sau` / `cld` / `mdt` — sauna / cold / meditation = yes
- `lab` — prior/concerning labs

A row inputs column lists present signals; absent signals are all-false/empty.

---

## 1. Design Decisions Committed in This Matrix

The PRD prescribes the algorithms; some operational details it leaves underspecified. The matrix below tests against specific decisions. **If the clinical reviewer overturns one, the matrix and the implementation update together.**

### 1.1 Readiness — non-obvious decisions (from ADR-001)

- **D-RG-1**: The `ai_confirmed` check must always be present in the input array, with `met: true` when there are no AI fields. Missing check → invariant violation, throws.
- **D-RG-2**: `confidence_ceiling === "low"` collapses two failure modes (High gap, AI unconfirmed). Tests assert the algorithm output, not the cause.
- **D-RG-3**: When `can_generate === false`, callers must not consume `confidence_ceiling`. The matrix includes a sentinel test (`RG-20`) for any code path that does.
- **D-RG-4**: `triggered_deep_dives_answered` is met vacuously when zero deep dives triggered. Same for `transcripts_verified` when zero transcripts uploaded.
- **D-RG-5**: `safety_flags_reviewed` is met when each safety flag has a recorded disposition (`acknowledge | refer | resolve`). Mere viewing does **not** count. (Assembly logic; the gate sees only the boolean.)

### 1.2 Friction Budget — non-obvious decisions (committed here)

The PRD §5.3 prose is consistent but not fully algorithmic. These decisions resolve it:

- **D-FB-1**: `max_augmented_modules` counts augmented modules only. Deterministic modules are uncounted (exempt).
- **D-FB-2**: `max_questions_per_module` is a cap on **total** questions per module (must + nice). Must-have is never dropped; if must-have alone exceeds the cap, all must-have render and zero nice-to-have render (cap is effectively overridden upward by must-have count).
- **D-FB-3**: `max_total_augmented_questions` caps the **sum** of (must + nice) across augmented modules only. Deterministic modules are exempt. Must-have is never dropped here either; the cap can be exceeded upward by must-have count.
- **D-FB-4**: When **deterministic module count alone exceeds `max_augmented_modules`**, all augmented modules are suppressed entirely (PRD §5.3 second bullet). This is a friction guard against patient cognitive overload.
- **D-FB-5**: Suppression and trimming respect **input order** — the analysis prompt is responsible for ranking modules and questions by relevance (most important first). The budget trims from the tail. This is deterministic and testable.
- **D-FB-6**: A deterministic module with **zero questions** still renders (its `was_budget_suppressed` is `false`). The renderer must handle the empty case; this is not the budget's problem.

### 1.3 Deterministic Triggers — non-obvious decisions

- **D-DT-1**: Output order is **stable** and matches the canonical signal order: `dig, hor, aut, med, sau|cld|mdt → wellness_practice, lab`. Same input always produces same output order.
- **D-DT-2**: `wellness_practice` is produced once even if multiple sub-signals (sauna AND cold AND meditation) are all true. No duplicate keys.
- **D-DT-3**: `medication_followups` triggers when the medications list has **at least one non-empty entry after trimming whitespace**. Empty array, all-whitespace entries, and null all fail to trigger.
- **D-DT-4**: A "concerning" lab classification cannot be made by the deterministic trigger function — that requires free-text interpretation (a separate analysis call). The `lab` signal is a clinician- or patient-provided boolean: "have you had prior labs?" Yes → `previous_labs_followups` always triggers; the *concerning* sub-classification happens elsewhere.

---

## 2. Quick Coverage Summary

| Module | Test count | Of which clinically load-bearing |
|---|---|---|
| Readiness Gate (§3) | 24 | 3 (RG-01, RG-09, RG-22) |
| Friction Budget (§4) | 22 | 2 (FB-08, FB-21) |
| Deterministic Triggers (§5) | 14 | 0 |
| Cross-cutting (§6) | 5 | 1 (XC-03) |
| Property invariants (§7) | 8 | 1 (INV-03) |
| **Total Phase 2** | **73** | **7 🏥** |

---

## 3. Readiness Gate Matrix

> Tested file: `lib/readiness/readiness.ts`. Implementation must match PRD §5.1 exactly.

### 3.1 The nine logical states (every reachable `(readiness, ceiling, can_generate)` triple)

| ID | Inputs (R1 R2 R3 H1 H2 M1 AI) | readiness | ceiling | can_generate | Notes |
|---|---|---|---|---|---|
| **RG-01** 🏥 | `✓✓✓✓✓✓✓` | `ready` | `high` | `true` | All met. The reference case. |
| **RG-02** | `✓✓✓✓✓✓✗` | `partial` | `low` | `true` | AI-only unmet. Ceiling drops to low (AI unconfirmed). |
| **RG-03** | `✓✓✓✓✓✗✓` | `partial` | `moderate` | `true` | Medium-only unmet. The only path to `moderate`. |
| **RG-04** | `✓✓✓✓✓✗✗` | `partial` | `low` | `true` | AI + Medium unmet. AI dominates → `low`. |
| **RG-05** | `✓✓✓✗✓✓✓` | `partial` | `low` | `true` | H1 (meds) only unmet. |
| **RG-06** | `✓✓✓✓✗✓✓` | `partial` | `low` | `true` | H2 (labs) only unmet. |
| **RG-07** | `✓✓✓✗✗✓✓` | `partial` | `low` | `true` | Both High unmet. |
| **RG-08** | `✓✓✓✗✓✗✓` | `partial` | `low` | `true` | H1 + M1 unmet. High dominates Medium. |
| **RG-09** 🏥 | `✗✓✓✓✓✓✓` | `insufficient` | `low` | `false` | R1 alone unmet. `can_generate` flips. |

### 3.2 Required-check isolation (which Required failed?)

| ID | Inputs | readiness | ceiling | can_generate | Notes |
|---|---|---|---|---|---|
| **RG-10** | `✗✓✓✓✓✓✓` | `insufficient` | `low` | `false` | R1 alone (duplicates RG-09 by design — covers blocking_gaps content) |
| **RG-11** | `✓✗✓✓✓✓✓` | `insufficient` | `low` | `false` | R2 alone |
| **RG-12** | `✓✓✗✓✓✓✓` | `insufficient` | `low` | `false` | R3 alone (safety flags not reviewed) |
| **RG-13** | `✗✗✗✓✓✓✓` | `insufficient` | `low` | `false` | All three Required unmet. `blocking_gaps.length === 3` |

### 3.3 Required dominates (combinations)

| ID | Inputs | readiness | Notes |
|---|---|---|---|
| **RG-14** | `✗✓✓✗✓✓✓` | `insufficient` | R1 + H1 → Required wins; ceiling is irrelevant (D-RG-3). |
| **RG-15** | `✗✓✓✗✗✗✗` | `insufficient` | Everything unmet that can be. Required wins. |
| **RG-16** | `✓✗✓✓✓✓✗` | `insufficient` | R2 + AI. Required wins. |

### 3.4 Gap-list content

| ID | Inputs | blocking_gaps | non_blocking_gaps | Notes |
|---|---|---|---|---|
| **RG-17** | `✓✓✓✗✓✗✓` | `[]` | `["medications_detailed", "transcripts_verified"]` | Both unmet checks land in non_blocking. |
| **RG-18** | `✗✓✓✗✓✗✓` | `["step1_complete"]` | `["medications_detailed", "transcripts_verified"]` | Required → blocking; others → non_blocking. |
| **RG-19** | `✓✓✓✓✓✓✗` | `[]` | `["ai_confirmed"]` | AI unmet goes to non_blocking, not blocking — it doesn't block generation. |

### 3.5 Invariants and architectural assertions

| ID | Setup | Expected | Notes |
|---|---|---|---|
| **RG-20** | Build a result where `can_generate === false`. Attempt to consume `confidence_ceiling` for behavior. | **Test fails** if implementation reads ceiling without first checking `can_generate`. | Architectural: defends D-RG-3. |
| **RG-21** | Input array missing the `ai_confirmed` check entirely. | Throws / fails the invariant. | D-RG-1. The `!.met` non-null assertion in §5.1 is load-bearing. |
| **RG-22** 🏥 | All checks present; `ai_confirmed.met === true` but all other AI-related fields in upstream data are unconfirmed. | Returns `ready / high` (gate trusts its inputs). | **This is the audit-required case.** The gate is only as good as its assembly; this test documents that the gate cannot detect rubber-stamping. Clinical sign-off must acknowledge this is the assembly's job, not the gate's. |
| **RG-23** | Empty input array. | Throws (no `ai_confirmed` check). | Same as RG-21; covers the empty edge. |
| **RG-24** | Duplicate `ai_confirmed` check (one met, one unmet). | First-match wins (Array `.find` behavior). | Documents — does not test as feature. Assembly should never emit duplicates; if it does, behavior is defined. |

---

## 4. Friction Budget Matrix

> Tested file: `lib/intake/friction-budget.ts`. Implementation follows PRD §5.3 plus design decisions §1.2.

### 4.1 Trivial cases

| ID | Inputs | Expected output | Notes |
|---|---|---|---|
| **FB-01** | (empty module list) | `{ modules: [], deterministic_count: 0, augmented_count: 0, suppressed: [], trimmed: [] }` | No-op base case. |
| **FB-02** | `1D(0M+0N)` | 1 module rendered, `was_budget_suppressed: false`, `questions_trimmed_count: 0` | D-FB-6: empty-bank deterministic module still renders. |

### 4.2 Pure deterministic — module-count behavior

| ID | Inputs | Expected | Notes |
|---|---|---|---|
| **FB-03** | `3D(3M+2N)`, budget defaults | All 3 render unchanged | Under all caps. |
| **FB-04** | `5D(2M+1N)`, budget `max_aug=4` | All 5 render unchanged | D-FB-4 doesn't fire because there are no augmented to suppress; det exempt from count cap. |
| **FB-05** | `6D(2M+1N)`, budget `max_aug=4` | All 6 render unchanged | Same as FB-04 with more det. |

### 4.3 Pure deterministic — per-module question trimming

| ID | Inputs | Expected per-module output | Notes |
|---|---|---|---|
| **FB-06** | `1D(4M+4N)`, budget `max_q=6` | 4 must + 2 nice = 6 questions; `questions_trimmed_count: 2` | Normal trim. |
| **FB-07** | `1D(7M+0N)`, budget `max_q=6` | 7 must + 0 nice = 7 questions; `questions_trimmed_count: 0` | Must never dropped, cap exceeded upward (D-FB-2). |
| **FB-08** 🏥 | `1D(7M+4N)`, budget `max_q=6` | 7 must + 0 nice = 7 questions; `questions_trimmed_count: 4` | The clinical-safety branch: must-have always survives; cap is effectively raised by must count. |
| **FB-09** | `1D(6M+4N)`, budget `max_q=6` | 6 must + 0 nice = 6 questions; `questions_trimmed_count: 4` | Cap exactly met by must alone; all nice trimmed. |

### 4.4 Pure augmented — module-count cap

| ID | Inputs | Expected | Notes |
|---|---|---|---|
| **FB-10** | `2A(2M+2N)`, budget `max_aug=4` | Both render | Under cap. |
| **FB-11** | `4A(2M+2N)`, budget `max_aug=4` | All 4 render | At cap. |
| **FB-12** | `5A(2M+2N)`, budget `max_aug=4` | First 4 render; 5th suppressed (`was_budget_suppressed: true`) | D-FB-5: input-order tail trim. |
| **FB-13** | `8A(1M+2N)`, budget `max_aug=4` | First 4 render; modules 5–8 suppressed | Larger suppression batch. |

### 4.5 Pure augmented — total question cap (max_total_augmented=18)

| ID | Inputs | Expected | Notes |
|---|---|---|---|
| **FB-14** | `4A(0M+5N)` (20 nice total), defaults | Trim nice from tail until total ≤ 18. Result: modules 1–2 keep 5N; module 3 keeps 5N; module 4 trimmed to 3N. Total: 18. | Round-robin from end → in practice, last module loses 2 nice. |
| **FB-15** | `3A(6M+0N)` (18 must total) | All 18 must render unchanged | At cap with must only. |
| **FB-16** | `4A(6M+0N)` (24 must total) | All 24 must render; cap violated upward | D-FB-3: must-have never dropped. **The total cap is advisory upward against must.** |
| **FB-17** | `2A(2M+8N)` per-module cap=6 | Each module: 2 must + 4 nice = 6 (per-module trim first); total = 12, under total cap | Demonstrates per-module trim happens **before** total trim. |

### 4.6 Mixed deterministic + augmented

| ID | Inputs | Expected | Notes |
|---|---|---|---|
| **FB-18** | `2D(3M+2N) + 2A(2M+2N)`, defaults | All render; det untouched | Under all caps. |
| **FB-19** | `3D(2M+1N) + 6A(1M+2N)`, `max_aug=4` | All 3 det render; first 4 aug render; 2 aug suppressed | Det exempt, aug truncated. |
| **FB-20** | `4D(2M+1N) + 4A(1M+2N)`, `max_aug=4` | All 4 det + all 4 aug render | `det_count == max_aug`, **not** "exceeds." D-FB-4 does not fire. |
| **FB-21** 🏥 | `5D(2M+1N) + 4A(1M+2N)`, `max_aug=4` | All 5 det render; **all 4 aug suppressed** | The PRD §5.3 second-bullet rule: `det_count(5) > max_aug(4)` → suppress all aug. The most subtle interaction; clinically load-bearing. |
| **FB-22** | `6D(2M+1N) + 0A`, `max_aug=4` | All 6 det render | No aug present; D-FB-4 has nothing to suppress. |

---

## 5. Deterministic Triggers Matrix

> Tested file: `lib/intake/deterministic-triggers.ts`. Implementation follows PRD §5.2 plus design decisions §1.3.

### 5.1 Single-signal triggers

| ID | Step-1 input | Expected output | Notes |
|---|---|---|---|
| **DT-01** | (all empty / false / null) | `[]` | No-signal baseline. DoD-3 input. |
| **DT-02** | `dig` | `["gut_deep_dive"]` | |
| **DT-03** | `hor` | `["hormone_deep_dive"]` | |
| **DT-04** | `aut` | `["immune_deep_dive"]` | |
| **DT-05** | `med=["metformin"]` | `["medication_followups"]` | One non-empty entry. |
| **DT-06** | `sau` | `["wellness_practice"]` | |
| **DT-07** | `lab` | `["previous_labs_followups"]` | |

### 5.2 Wellness-practice de-duplication

| ID | Step-1 input | Expected output | Notes |
|---|---|---|---|
| **DT-08** | `cld` | `["wellness_practice"]` | Sub-signal #2. |
| **DT-09** | `mdt` | `["wellness_practice"]` | Sub-signal #3. |
| **DT-10** | `sau, cld, mdt` | `["wellness_practice"]` | Three sub-signals → one module key (D-DT-2). |

### 5.3 Medication edge cases

| ID | Step-1 input | Expected output | Notes |
|---|---|---|---|
| **DT-11** | `med=[]` | `[]` | Empty array → no trigger (D-DT-3). |
| **DT-12** | `med=[""]` | `[]` | Empty string entry → no trigger (after trim). |
| **DT-13** | `med=["   "]` | `[]` | Whitespace-only entry → no trigger (after trim). |
| **DT-14** | `med=["", "metformin", " "]` | `["medication_followups"]` | Any one non-empty trimmed entry triggers. |

### 5.4 Combinations and order stability

| ID | Step-1 input | Expected output | Notes |
|---|---|---|---|
| **DT-15** | `dig, hor` | `["gut_deep_dive", "hormone_deep_dive"]` | Canonical order (D-DT-1). |
| **DT-16** | `hor, dig` (different input order) | `["gut_deep_dive", "hormone_deep_dive"]` | Output order is invariant to input order — depends only on signal presence. |
| **DT-17** | `dig, hor, aut, med=["x"], sau, lab` | `["gut_deep_dive", "hormone_deep_dive", "immune_deep_dive", "medication_followups", "wellness_practice", "previous_labs_followups"]` | All six modules in canonical order. |

> Note: DT-15 and DT-16 together pin **output order is content-only, not insertion-order**.

---

## 6. Cross-Cutting Matrix

> Tests that exercise multiple Phase 2 modules together. These are still pure (no I/O); they catch interactions that single-module tests miss.

| ID | Setup | Expected | Notes |
|---|---|---|---|
| **XC-01** | Step-1 with `dig, hor, aut, med, sau, lab` (all 6 signals) → run deterministic-triggers → feed result into friction-budget as 6 deterministic modules, plus 4 augmented modules from a fixture, with default budget. | 6 deterministic render; all 4 augmented suppressed (D-FB-4). | The DoD-2 invariant: deterministic over budget → all det render. |
| **XC-02** | Step-1 with no signals → triggers returns `[]` → readiness checklist has `triggered_deep_dives_answered.met = true` (vacuous). | `readiness = ready` if all other checks met. | D-RG-4 vacuous-met verification across modules. |
| **XC-03** 🏥 | Step-1 with `dig` only → triggers returns `["gut_deep_dive"]`. Question banks for `gut_deep_dive` has **zero questions** (data corruption simulation) → renders with 0 questions. Readiness checklist's `triggered_deep_dives_answered.met` is computed by API-7 assembly (Phase 6); for Phase 2 we test the upstream: friction-budget passes the empty module through; deterministic-triggers returns the key regardless. | All three modules behave correctly under the empty-bank degenerate case. | The "what if a triggered module's bank is empty" edge from the build plan. Phase 2 verifies the pure logic is robust; Phase 6 will verify the assembly decides whether to call `triggered_deep_dives_answered.met = true` or `false` in this case. **Open question flagged for clinical review** (see §9). |
| **XC-04** | Deterministic-triggers output → readiness checklist assembly (mock) → readiness function. Run with one Required missing. | `insufficient`. Establishes the full pipeline shape for Phase 6. | Smoke test, not exhaustive. |
| **XC-05** | Friction-budget output → fed into the question-plan schema's `.superRefine` invariant check (deterministic-not-suppressed). | All valid budget outputs pass the schema invariant. Constructed-invalid outputs (manually flip `was_budget_suppressed: true` on a det module) fail the schema. | The PRD §5.3 invariant is enforced in **two** places (budget code + schema); this test proves they agree. |

---

## 7. Property-Based Invariants

> Run against many randomly generated inputs (suggest 200+ iterations). These catch the bugs the example-based tests miss.

| ID | Property | Domain |
|---|---|---|
| **INV-01** | For any randomly generated `ReadinessCheck[]` containing an `ai_confirmed` check, the output's `can_generate === (readiness !== "insufficient")`. | Readiness Gate |
| **INV-02** | For any input, `readiness === "ready"` implies `confidence_ceiling === "high"` and vice versa. | Readiness Gate |
| **INV-03** 🏥 | For any module list and any budget config, deterministic modules in the output have `was_budget_suppressed === false`. **The PRD §5.3 load-bearing invariant.** | Friction Budget |
| **INV-04** | For any module list, `output.length <= input.length`. The budget removes modules, never adds. | Friction Budget |
| **INV-05** | For any module list, total **must-have** question count is preserved across input and output (per module). Must-have never drops. | Friction Budget |
| **INV-06** | For any Step-1 input, the deterministic-triggers output has no duplicates. | Deterministic Triggers |
| **INV-07** | For any Step-1 input, every module key in deterministic-triggers output is in `MODULE_KEYS` (the closed enum). | Deterministic Triggers |
| **INV-08** | For any two Step-1 inputs with the same set of *present* signals (regardless of how those signals were written into the structure), deterministic-triggers returns the same output in the same order. | Deterministic Triggers (D-DT-1) |

---

## 8. Tests Deferred — NOT in Phase 2

The following look like they belong here but are intentionally pushed to a later phase. Listed so they don't get lost.

| Deferred test | Phase | Reason |
|---|---|---|
| API-7 assembly: turning patient/document state into a `ReadinessCheck[]` correctly | Phase 6.1 | Requires DB and request context; not pure. |
| The `safety_flags_reviewed.met` computation (which dispositions count) | Phase 6.1 | Same; depends on the safety-flag schema, which is out of Phase 2 scope. |
| Lab waiver authorization (who can waive, audit trail) | Phase 6 | API + audit, not pure logic. |
| `format-timeline-for-prompt` excluding unconfirmed AI fields | Phase 6.2 | DoD-10; requires `_ai_confirmations` JSONB navigation. |
| DC-1 through DC-5 validators (degraded-confidence output post-validation) | Phase 6.4 | These are content validators, not gate logic. Separate ADR. |
| The question-plan Zod schema fixtures (positive + negative) | Phase 2.2 (separate test file) | Covered by schema design §7; not duplicated here. |
| `merge-intake.ts` provenance behavior | Phase 2.7 (separate test file) | Tested in its own file with its own matrix (small enough to inline as comments). |
| Token mint/verify/lockout | Phase 3.1 | Pure-ish but requires Crypto + clock; not Phase 2. |
| Whisper output normalization | Phase 5.5 | Requires fixtures; not pure. |
| Race condition between readiness widget read and generate call | Phase 6/7 integration | Cannot be exercised in pure tests. |

---

## 9. Open Questions Flagged for Phase 2 Clinical Sign-off

These are the questions the clinical reviewer must answer before Phase 2 is signed off. Each maps to a row above that the answer affects.

1. **XC-03 (empty-bank case)**: When a deterministic module triggers but its question bank is empty (data error), should the patient see the module with a "no follow-ups needed" message, or should the system silently skip the module and let the gate's `triggered_deep_dives_answered` check still pass? **Provisional: render with empty-state message; gate check considers triggered count vs. answered count, so a zero-question module is vacuously answered.** Needs clinical call.

2. **RG-22 (rubber-stamping)**: The gate trusts `ai_confirmed.met`. A clinician who batch-confirms AI fields without reading them defeats the gate. The Phase 2 test acknowledges this; the **mitigation** must be a Phase 7 UX/audit decision (e.g., per-field "confirmed" requires at least N seconds of view time, or audit alerts on >K confirmations in <T seconds). Phase 2 does not need to wait on the mitigation, but it must be tracked.

3. **D-RG-5 (safety-flag disposition vocabulary)**: Provisional set is `acknowledge | refer | resolve`. Each maps to `met: true` for `safety_flags_reviewed`. Confirm vocabulary before Phase 6.

4. **D-DT-4 ("concerning" labs)**: `previous_labs_followups` triggers on "have you had prior labs?" — a binary. The "concerning" judgment happens in free-text interpretation. Confirm this is correct: a patient with prior unremarkable labs should still see the upload prompt. **Provisional: yes** — the deep-dive lets the clinician review even unremarkable labs.

5. **FB-16 (must-have exceeds total cap)**: When augmented modules have more must-have questions than `max_total_augmented_questions` allows, must-have wins and the cap is violated upward. Is this acceptable, or should the prompt be redesigned to never emit that many must-have? **Provisional: keep the invariant ("must-have never dropped") as the safety floor; flag prompts that hit this case for review since it suggests the LLM is over-claiming necessity.**

---

## 10. How to Feed This to Cursor

The matrix is structured so each row is one Cursor prompt's worth of work. Suggested workflow:

1. **One test file per module** under test: `readiness.test.ts`, `friction-budget.test.ts`, `deterministic-triggers.test.ts`. Cross-cutting tests go in `phase-2-integration.test.ts`. Property tests in `*.property.test.ts`.

2. **One Composer prompt to scaffold the test file**, with the matrix rows pasted in. Example: *"Create `lib/readiness/readiness.test.ts`. For each row in this matrix [paste §3], write one Vitest `it(...)` block. Test name is the row ID. Setup follows the input notation in §0.2. Do not implement `readiness.ts` yet; the tests must fail with `readiness is not defined`."*

3. **Then one Composer prompt to implement** the function: *"Implement `lib/readiness/readiness.ts` per PRD §5.1 and ADR-001. Make all tests in `readiness.test.ts` pass. Do not modify the tests."* — the test file is the spec, the PRD is the rationale.

4. **Run, then have Claude review the diff** before merging (per Part 3 of the build plan): "Did the implementation get anything past the tests it shouldn't have?"

5. **Clinical sign-off pass**: read the 7 🏥 tests out loud with the clinician and walk through the expected behavior in their own words. If they say "wait, that's not what I'd expect" on any row — stop, update the matrix, update the test, then update the implementation. The matrix is the contract; the test enforces it; the implementation satisfies it. Drift is caught here.

---

## 11. Maintenance

When a row changes:

1. Update this matrix first.
2. Update the test (test name = matrix ID).
3. Update the implementation if needed.
4. Note the change in this section with date + reason.

When a new test is needed mid-implementation:

1. Add the row here first. If you cannot articulate the row, the test isn't ready to write.
2. Allocate the next available ID in the appropriate prefix.
3. Then write the test.

Add-only — never delete rows. Mark deprecated rows with `~~strikethrough~~` and a date. Tests that no longer apply still document why the system used to behave that way.
