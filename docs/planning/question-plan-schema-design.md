# Design: `question-plan.schema.ts` — The LLM Output Contract

| | |
|---|---|
| **Status** | Proposed (pending Phase 2 review) |
| **Decision area** | `lib/intake/schemas/question-plan.schema.ts` |
| **Implements** | PRD §2.1 step 5, §5.2, §5.3, §5.6 |
| **Consumed by** | `lib/llm/analyze-intake.ts`, `app/api/intake/analyze/route.ts`, `app/intake/[token]/step-two/step-two-renderer.tsx` |
| **Companion docs** | ADR-001 (Readiness Gate); the Phase 2 test matrix (next deliverable) |
| **Reviewers required** | Engineering lead, clinical lead |

---

## 1. Purpose and Trust Boundary

This schema is the **trust boundary** between the LLM and the rest of the system. Every byte the LLM emits passes through this Zod parser before any code touches it. If the parse succeeds, downstream code may treat the output as structurally valid. If it fails, `analyze-intake.ts` retries exactly once (PRD §5.6) and, on second failure, drops into the degraded path (PRD §2.2 — `analysis_degraded = true`, deterministic-only modules render).

The schema is therefore not just a type definition. It is the **kill switch** for unreliable model output. Three properties matter:

1. **Closed enumerations everywhere they can fit.** The LLM cannot invent module keys, control kinds, or signal sources. Anything not in the enum fails parsing immediately.
2. **Bounded sizes on every array and string.** Defense against verbosity, prompt injection that asks for absurd output sizes, and runaway token cost.
3. **The LLM never emits state that belongs to the server.** Specifically: the LLM never tells us a module is "deterministic" or "was budget-suppressed." The server adds those fields after a validated parse.

This last point drives the **two-layer design** in §3.

---

## 2. What the Schema Does NOT Cover

To keep scope tight, this schema does **not** cover:

- **Free-text interpretation output.** That is a separate analysis call with its own prompt (`intake_freetext_interpretation_v1.md`) and its own schema. The question-planning call is decoupled.
- **The Step-1 input data.** That is `step-one.schema.ts` (Phase 2.1).
- **Persisted intake data.** That is `intake-data.schema.ts` (Phase 2.3), which includes `_provenance` and `_ai_confirmations`.
- **Red-flag classification taxonomy.** This schema acknowledges red flags exist (the LLM may mark `red_flag: true` on an issue) but the clinician-facing safety-flag taxonomy lives elsewhere.

The boundary is: this schema covers exactly what comes out of `intake_dynamic_questions_v1.md` and the server-side post-processing of that output.

---

## 3. The Two-Layer Design

The most important architectural decision in this file: there are **two schemas**, not one. They share a base but differ in what fields are present.

```
QuestionPlanLLMOutput  →  validate  →  enrich  →  QuestionPlanResolved
   (what the LLM emits)               (server      (what /api/intake/analyze returns)
                                       adds)
```

- **`QuestionPlanLLMOutput`** is what comes back from the Anthropic call. It contains only data the LLM is qualified to produce: identified issues, proposed augmented modules, proposed questions, red-flag screening.

- **`QuestionPlanResolved`** is what API-3 returns to the client. It is the LLM output **merged with deterministic triggers** (§5.2), **with the friction budget applied** (§5.3), **with `is_deterministic` flags set authoritatively by the server**, and **with a budget report** describing what was suppressed and trimmed.

Splitting these prevents the LLM from claiming a module is deterministic when it is not. The LLM literally cannot emit `is_deterministic: true` because the field does not exist in `QuestionPlanLLMOutput`. The server is the only writer. This is the architectural move that makes the PRD §5.3 invariant — "budget cannot suppress deterministic" — enforceable at the type system level, not only in the budget function's tests.

---

## 4. The Types

### 4.1 Closed enumerations

```ts
export const MODULE_KEYS = [
  "gut_deep_dive",
  "hormone_deep_dive",
  "immune_deep_dive",
  "medication_followups",
  "sleep_deep_dive",
  "stress_deep_dive",
  "wellness_practice",
  "previous_labs_followups",
] as const;
export const ModuleKey = z.enum(MODULE_KEYS);
export type ModuleKey = z.infer<typeof ModuleKey>;
```

The same eight keys appear in `deterministic-triggers.ts` and in `question-banks.ts`. **One source of truth.** Adding a module is an explicit code change across all three files plus the renderer's module map; the schema fails closed on anything else.

```ts
export const SignalSource = z.enum([
  "symptom",      // patient-reported symptom in Step 1
  "medication",   // listed medication or supplement
  "lifestyle",    // sauna, cold exposure, meditation, diet
  "history",      // prior labs, prior diagnoses, family history
]);

export const QuestionPriority = z.enum(["must_have", "nice_to_have"]);
```

`QuestionPriority` is the lever §5.3 uses for budget-driven trimming: nice-to-have questions are trimmed first; must-have questions are never dropped.

### 4.2 Input controls — discriminated union

```ts
const ChipsControl = z.object({
  kind: z.literal("chips"),
  multi: z.boolean(),
  options: z
    .array(z.object({
      value: z.string().min(1).max(48),
      label: z.string().min(1).max(80),
    }))
    .min(2)
    .max(12),
});

const SliderControl = z.object({
  kind: z.literal("slider"),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  unit: z.string().max(16).optional(),
  default_value: z.number().optional(),
}).refine(s => s.max > s.min, { message: "max must be greater than min" });

const FreeTextControl = z.object({
  kind: z.literal("free_text"),
  multiline: z.boolean(),
  max_chars: z.number().int().min(20).max(2000),
  placeholder: z.string().max(120).optional(),
});

const BristolControl = z.object({
  kind: z.literal("bristol"),  // The 7-type Bristol Stool Chart selector
});

const YesNoControl = z.object({
  kind: z.literal("yes_no"),
});

const NumericControl = z.object({
  kind: z.literal("numeric"),
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string().max(16).optional(),
});

export const Control = z.discriminatedUnion("kind", [
  ChipsControl,
  SliderControl,
  FreeTextControl,
  BristolControl,
  YesNoControl,
  NumericControl,
]);
```

Discriminated union on `kind` rather than a generic `type: string` for two reasons: Zod produces precise error messages (`expected chips | slider | …, got dropdown`), and downstream TypeScript narrowing in `step-two-renderer.tsx` is exhaustive — the compiler will catch any new control kind that is not handled in the renderer.

**Why these six controls and not more.** This is the closed set referenced in PRD §2.1 ("chips, sliders, Bristol selector, free text") plus `yes_no` and `numeric`, which are degenerate-but-common cases that do not deserve to be encoded as chips. Adding a new control type requires (a) adding it here, (b) adding a renderer branch in `step-two-renderer.tsx`, (c) updating the prompt to teach the LLM when to use it. All three are code-review gates.

### 4.3 Questions and identified issues

```ts
export const Question = z.object({
  id: z.string().regex(
    SCHEMA_LIMITS.question_id_pattern,
    "id must be lowercase snake_case, start with a letter, 3–64 chars",
  ),
  prompt: z.string().min(3).max(SCHEMA_LIMITS.question_prompt_max_chars),
  help_text: z.string().max(280).optional(),
  control: Control,
  priority: QuestionPriority,
  required: z.boolean(),  // must answer to proceed past Step 2
});
```

Notes:

- **`id` is regex-validated.** This is the field merged into `intake_data` as a JSONB key. Permissive ids lead to data we cannot query reliably; the regex is a guardrail against the LLM emitting `"the patient's bowel frequency?"` as an id.
- **`prompt.max(280)`** is a deliberate friction nudge. If the LLM wants to write a paragraph, the schema rejects it and the retry pressures terseness. Mobile UX requires it.
- **`required` is independent of `priority`.** `priority = "must_have"` controls whether the friction budget can drop the question; `required = true` controls whether the patient must answer it. A must-have question can be optional ("we'd like to ask this but won't block on it"), and a nice-to-have question can be required *if presented* ("if we ask it, answer it").

```ts
export const IdentifiedIssue = z.object({
  id: z.string().regex(SCHEMA_LIMITS.question_id_pattern),
  label: z.string().min(3).max(120),
  signal_source: SignalSource,
  red_flag: z.boolean(),
});
```

The `red_flag` boolean is the LLM's recommendation; the **server is the final arbiter** of whether to surface a safety flag (PRD §5.6). The clinician-visible safety-flag system reads `red_flag === true` and applies its own taxonomy on top.

### 4.4 Module plans — LLM-emitted

```ts
export const ModulePlanLLM = z.object({
  module_key: ModuleKey,
  rationale: z.string().min(3).max(280),
  questions: z.array(Question).min(0).max(SCHEMA_LIMITS.max_questions_per_module_hard_ceiling),
});
```

Two non-obvious decisions:

- **`questions.min(0)`** — yes, zero questions in a module is valid. This is the case where the LLM wants to flag that a module is *relevant* but has nothing to augment beyond the static question bank. The renderer merges static + LLM questions per module; an empty LLM contribution is fine.
- **`rationale` is required and bounded.** Every augmented module the LLM proposes must justify itself in ≤ 280 chars. The rationale is audit-logged with the analysis call and gives the clinician a reason for "why is this module showing up?" — also the place to look first when debugging surprising plans. Making it optional would mean the LLM omits it and we lose the audit trail.

The `max(20)` on questions is a hard ceiling per module. The friction budget (§5.3) defaults to 6 per module, so 20 is well above what we would ever ship — it exists as a defense against the LLM emitting 50 questions, not as a target. See §5 on why these numbers are split.

### 4.5 The LLM output envelope

```ts
export const QuestionPlanLLMOutput = z.object({
  identified_issues: z.array(IdentifiedIssue).min(0).max(SCHEMA_LIMITS.max_identified_issues),
  question_plan: z.array(ModulePlanLLM).min(0).max(MODULE_KEYS.length),
  red_flag_screening: z.array(Question).min(0).max(SCHEMA_LIMITS.max_red_flag_screening).optional(),
});
export type QuestionPlanLLMOutput = z.infer<typeof QuestionPlanLLMOutput>;
```

The bounds:

- `identified_issues.max(20)` — clinical intakes do not have 50 issues. If the LLM emits that many, something is wrong; fail closed.
- `question_plan.max(MODULE_KEYS.length)` — there are 8 module keys; the LLM cannot propose more module plans than there are modules. Duplicate `module_key` values across plans are caught by `.superRefine()` (§4.7).
- `red_flag_screening` is optional — its absence means the LLM identified no red flags. Its presence with `min(0)` lets the LLM emit an empty array (semantically identical) without us caring which it chose.

### 4.6 Server-resolved envelope

```ts
export const ModulePlanResolved = ModulePlanLLM.extend({
  is_deterministic: z.boolean(),
  was_budget_suppressed: z.boolean(),
  questions_trimmed_count: z.number().int().nonnegative(),
});

export const FrictionBudgetReport = z.object({
  deterministic_module_count: z.number().int().nonnegative(),
  augmented_module_count: z.number().int().nonnegative(),
  augmented_modules_suppressed: z.array(ModuleKey),
  questions_trimmed: z.array(z.object({
    module_key: ModuleKey,
    trimmed_count: z.number().int().nonnegative(),
  })),
  budget_applied: z.object({
    max_augmented_modules: z.number().int().nonnegative(),
    max_questions_per_module: z.number().int().nonnegative(),
    max_total_augmented_questions: z.number().int().nonnegative(),
  }),
});

export const QuestionPlanResolved = z.object({
  identified_issues: z.array(IdentifiedIssue).max(SCHEMA_LIMITS.max_identified_issues),
  question_plan: z.array(ModulePlanResolved),
  red_flag_triggered: z.boolean(),
  red_flag_screening: z.array(Question).max(SCHEMA_LIMITS.max_red_flag_screening).optional(),
  friction_budget_report: FrictionBudgetReport,
  analysis_degraded: z.boolean(),
  model_id: z.string().min(1).max(120),
  prompt_version: z.string().min(1).max(40),
});
export type QuestionPlanResolved = z.infer<typeof QuestionPlanResolved>;
```

Why these fields:

- **`is_deterministic`** — set by the server based on whether the module key appeared in the deterministic-trigger map. Authoritative.
- **`was_budget_suppressed`** — `true` only for *augmented* modules suppressed by budget. Deterministic modules cannot have this set to `true` (PRD §5.3 invariant). Enforced in §4.7.
- **`questions_trimmed_count`** — diagnostic; tells the renderer (and the audit log) how many nice-to-have questions got dropped from this module.
- **`friction_budget_report`** — the full budget audit trail. Surfaces in the clinician-visible audit log and the dev console; not shown to the patient.
- **`analysis_degraded`** — the single source of truth for whether the degraded path was taken. Persisted to `intake_data._analysis_degraded` (PRD §4.1).
- **`model_id` and `prompt_version`** — required by PRD §5.6 ("record `model_id` + prompt version"). The schema enforces non-empty; the call site reads these from `process.env.ANTHROPIC_MODEL` and from a constant in the prompt file.

### 4.7 Cross-field invariants — `.superRefine()`

The structural schema cannot catch every rule. Four invariants need `.superRefine()`.

**On `QuestionPlanLLMOutput`** — duplicate-id detection across four namespaces:

```ts
.superRefine((plan, ctx) => {
  // 1. No duplicate module keys
  const keys = plan.question_plan.map(m => m.module_key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["question_plan"],
      message: `duplicate module_key: ${dupes.join(", ")}`,
    });
  }

  // 2. No duplicate question ids within a module
  for (const [i, module] of plan.question_plan.entries()) {
    const qids = module.questions.map(q => q.id);
    const qdupes = qids.filter((id, j) => qids.indexOf(id) !== j);
    if (qdupes.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["question_plan", i, "questions"],
        message: `duplicate question id in module ${module.module_key}: ${qdupes.join(", ")}`,
      });
    }
  }

  // 3. No duplicate question ids in red_flag_screening
  if (plan.red_flag_screening) {
    const rfIds = plan.red_flag_screening.map(q => q.id);
    const rfDupes = rfIds.filter((id, j) => rfIds.indexOf(id) !== j);
    if (rfDupes.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["red_flag_screening"],
        message: `duplicate red-flag screening question id: ${rfDupes.join(", ")}`,
      });
    }
  }

  // 4. No duplicate identified-issue ids
  const iids = plan.identified_issues.map(i => i.id);
  const iidDupes = iids.filter((id, j) => iids.indexOf(id) !== j);
  if (iidDupes.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["identified_issues"],
      message: `duplicate identified-issue id: ${iidDupes.join(", ")}`,
    });
  }
});
```

Duplicate-id detection is critical because the merge step (`merge-intake.ts`) keys on these ids. A duplicate id in the LLM output would silently overwrite data on merge.

**On `QuestionPlanResolved`** — the load-bearing §5.3 invariant:

```ts
.superRefine((resolved, ctx) => {
  const violators = resolved.question_plan.filter(
    m => m.is_deterministic && m.was_budget_suppressed
  );
  if (violators.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["question_plan"],
      message: `INVARIANT VIOLATION: deterministic modules suppressed by budget: ${violators.map(v => v.module_key).join(", ")}`,
    });
  }
});
```

This is **the §5.3 invariant** encoded as a schema check. Any code path that could produce this state fails parsing and crashes loudly. The Phase 2 friction-budget test should specifically construct an attempted violation and assert this branch fires. Defense in depth: the invariant is enforced in two places (the budget function plus this schema), and the Phase 2 matrix verifies both agree.

---

## 5. Constants and Their Source

Several numeric limits appear in the schema. **None of them are inlined as magic numbers in `question-plan.schema.ts`.** They live in a single constants module:

```ts
// lib/intake/constants.ts
export const FRICTION_BUDGET_DEFAULTS = {
  max_augmented_modules: 4,
  max_questions_per_module: 6,
  max_total_augmented_questions: 18,
} as const;

export const SCHEMA_LIMITS = {
  max_questions_per_module_hard_ceiling: 20,   // schema rejection threshold
  max_identified_issues: 20,
  max_red_flag_screening: 10,
  question_prompt_max_chars: 280,
  question_id_pattern: /^[a-z][a-z0-9_]{2,63}$/,
} as const;
```

The schema imports `SCHEMA_LIMITS`. The friction budget imports `FRICTION_BUDGET_DEFAULTS`. The two never collide because the schema's ceiling (20 questions/module) is well above the budget's working limit (6 questions/module). **The schema is the rejection threshold; the budget is the trim threshold.** These are deliberately different numbers serving different purposes — reviewers sometimes try to collapse them, and the collapse loses the distinction between "the LLM did something egregious" (reject) and "the LLM did something reasonable that exceeds budget" (trim).

---

## 6. Versioning

The schema is **v1**. When it changes:

- **Backward-compatible additions** (new optional fields, new control kinds, larger bounds): bump the patch version of `prompt_version`. No schema file change required.
- **Breaking changes** (new required field, removed module key, tightened bounds): ship `question-plan.schema.v2.ts` alongside v1, route by `prompt_version`. Do **not** modify v1 in place — there are stored `intake_data` rows that were validated against v1 and a re-validation must succeed.

The `prompt_version` field on the resolved envelope is therefore load-bearing for migration: it is how we know which schema version produced a stored plan.

---

## 7. Test Fixtures (Phase 2 input)

The Phase 2 schema test must cover both happy and adversarial paths. Below is the **fixture taxonomy** the test file (`question-plan.schema.test.ts`) needs to populate. The Phase 2 test matrix (next deliverable) will give each one a test ID.

### 7.1 Positive fixtures (parse succeeds)

1. **`empty_plan`** — no issues, no modules, no red flags. The no-signal case.
2. **`single_deterministic`** — one issue (digestive symptom), one module plan (`gut_deep_dive`), three questions.
3. **`multiple_deterministic`** — three issues, three module plans covering gut/hormone/medication.
4. **`with_red_flags`** — one issue with `red_flag: true`, two red-flag screening questions.
5. **`augmented_at_budget`** — four augmented modules with 6 questions each (exactly at budget).
6. **`with_help_text`** — questions including optional `help_text`.
7. **`all_control_kinds`** — at least one question of each of the six `Control.kind` values, including the Bristol selector.

### 7.2 Negative fixtures (parse fails)

1. **`unknown_module_key`** — `module_key: "custom_module"`. Expected: `ZodError` on `question_plan[0].module_key`.
2. **`unknown_control_kind`** — `control.kind: "dropdown"`. Expected: discriminated-union error.
3. **`chips_one_option`** — chips control with a single option. Expected: `options` `min(2)` error.
4. **`free_text_zero_chars`** — `max_chars: 0`. Expected: `min(20)` error.
5. **`prompt_empty`** — `prompt: ""`. Expected: `min(3)` error.
6. **`prompt_too_long`** — 281-char prompt. Expected: `max(280)` error.
7. **`id_with_spaces`** — `id: "bowel frequency"`. Expected: regex error.
8. **`id_starting_with_digit`** — `id: "1_question"`. Expected: regex error.
9. **`duplicate_module_key`** — two `ModulePlanLLM` entries with `module_key: "gut_deep_dive"`. Expected: `.superRefine` duplicate-module error.
10. **`duplicate_question_id_within_module`** — two questions in the same module with `id: "frequency"`. Expected: `.superRefine` duplicate-question error.
11. **`twenty_one_issues`** — 21 entries in `identified_issues`. Expected: `max(20)` error.
12. **`slider_max_le_min`** — `min: 10, max: 5`. Expected: `.refine` failure.
13. **`twenty_one_questions_per_module`** — 21 questions in one module. Expected: `max(20)` error.

### 7.3 Resolved-envelope-specific fixtures

14. **`deterministic_module_suppressed`** — a resolved plan attempting `is_deterministic: true, was_budget_suppressed: true`. Expected: invariant-violation error from `.superRefine`. **This is the load-bearing §5.3 test.**
15. **`missing_model_id`** — resolved plan with `model_id: ""`. Expected: `min(1)` error.
16. **`missing_prompt_version`** — resolved plan with `prompt_version: ""`. Expected: `min(1)` error.

### 7.4 Round-trip property

For every positive fixture: `Schema.parse(Schema.parse(fixture))` must equal `Schema.parse(fixture)`. The schema is idempotent under parse, which `intake_data` storage and replay depend on.

---

## 8. Consequences

### Positive

- **The LLM cannot lie about determinism, budget, model identity, or prompt version.** All four are server-set.
- **Duplicate-id bugs are caught at the trust boundary**, not silently merged downstream by `merge-intake.ts`.
- **The §5.3 invariant ("budget cannot suppress deterministic") is enforced at the schema level**, not only in the budget function. Defense in depth.
- **Control kinds are exhaustively typed**, so the renderer's `switch` on `control.kind` is compiler-checked.
- **Bounded sizes** cap cost and contain the blast radius of an LLM verbosity bug.

### Negative

- **The schema is large.** Five named types, six control kinds, two envelopes, two `.superRefine` blocks. The file will press against the 500-LOC ceiling. *Mitigation*: split control definitions into `controls.schema.ts` if it crosses ~400 LOC.
- **The two-layer design adds an enrichment step** in `analyze-intake.ts` / API-3. The cost is one extra Zod parse on the resolved object. Acceptable.
- **The hard ceilings (20 questions/module, 280-char prompts)** are conservative and might need tuning. Easy to change in `SCHEMA_LIMITS`; no consumer code changes required.

### Neutral

- **The `rationale` field on every augmented module is mandatory.** Some teams will see this as overhead; we see it as audit. Required, full stop.

---

## 9. Open Questions for Phase 2 Review

1. **Do we need a `previous_labs_followups` upload-prompt sub-type?** PRD §5.2 says this module includes an upload prompt. Is that a question with a special control kind, or a separate field on the module plan? *Provisional*: a question with `control.kind = "free_text"` is fine for v1; the upload UI is rendered by the module component, not the schema.
2. **Should `red_flag_screening` questions be allowed to have any `Control.kind`, or restricted to `yes_no`?** *Provisional*: any kind. Some red-flag follow-ups are best served by chips ("if you have chest pain, where: [left arm / jaw / center / radiating / none]").
3. **Should `IdentifiedIssue` carry a severity field?** *Provisional*: no — severity belongs in the safety-flag taxonomy, not in the question-planning output. Adding it here pulls clinical-classification work into the planning prompt, which is the wrong layer.
4. **Do we want a `confidence` field on `IdentifiedIssue`** (how sure was the LLM)? *Provisional*: no for v1. The whole intake is treated as needing clinician confirmation via the `ai_confirmed` gate; per-issue confidence adds complexity without changing behavior.

---

## 10. Next Deliverables in the Pre-Development Checklist

This document fixes the contract. The next two artifacts to draft, in order:

1. **The Phase 2 test matrix.** Consolidates the readiness-gate matrix (ADR-001 §10) with the friction-budget matrix and the deterministic-trigger matrix. Single source for what Phase 2 verifies before the human review pass.
2. **The DC-1 validator approach.** Regex vs. NER vs. LLM-judge for "rejects unhedged mg/IU/frequency" (PRD §5.4 / DC-1). This is the next architectural decision and the one with the most degrees of freedom; an early design pass saves rework in Phase 6.
