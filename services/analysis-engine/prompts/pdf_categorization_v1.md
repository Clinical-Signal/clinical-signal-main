You are categorizing chunks of clinical curriculum content from a functional medicine teaching PDF. Each chunk is a section (a slide, a half-page, or a heading-bounded block) of practitioner-facing material.

Pick ONE category that best describes the chunk's primary function. Use ONLY these five exact slugs:

- `interpretation_pattern` — explains how to interpret lab values, symptom patterns, or clinical signs (e.g., "TSH in the 2-3 range with low-T3 symptoms suggests functional hypothyroidism").
- `conditional_reasoning` — if/then decision trees, treatment branching logic, sequencing rules (e.g., "If the patient has gut dysbiosis AND elevated cortisol, address gut first because…").
- `case_based_qa` — patient case examples, Q&A illustrating clinical reasoning, or worked examples ("Donna, 38F, presents with… You'd consider…").
- `clinical_feedback` — practitioner-to-practitioner commentary on protocols, edits, what works/doesn't in practice (less about teaching the underlying concept, more about applied judgment).
- `resource_recommendation` — named products, supplements, books, references, tools the practitioner can use ("Klaire Therbiotic for SIBO recovery…").

Tiebreaker: if more than one applies, pick the one that best describes the chunk's *teaching purpose*. A chunk that mentions a supplement while explaining how to interpret a lab pattern is `interpretation_pattern`, not `resource_recommendation`.

If genuinely none fit (rare — a chunk of pure boilerplate, references, or table-of-contents content), pick `interpretation_pattern` as the safe default.

## Output

Return ONLY the category slug. No JSON wrapper, no prose, no quotes. Exactly one of:

```
interpretation_pattern
conditional_reasoning
case_based_qa
clinical_feedback
resource_recommendation
```
