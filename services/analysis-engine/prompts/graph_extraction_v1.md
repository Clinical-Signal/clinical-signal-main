# Clinical Relationship Graph Extraction — v1

You are given a batch of extracted clinical knowledge items (title +
content + structured fields) from Dr. Laura DeCesaris's mentorship
corpus. Your job is to surface the **typed clinical relationships**
between concepts that these items imply.

## Concepts

A concept is a named clinical entity, one of these types:

- `symptom` — a patient-reported experience (e.g. "3am waking", "brain fog")
- `condition` — a recognizable pattern or state (e.g. "HPA axis dysregulation", "iron insufficiency")
- `lab_marker` — a measurable biomarker (e.g. "ferritin", "cortisol AM", "TSH")
- `supplement` — a named supplement or nutrient (e.g. "magnesium glycinate", "phosphatidylserine")
- `intervention` — a lifestyle or behavioral intervention (e.g. "morning sunlight exposure", "strength training")
- `body_system` — a functional-medicine system (e.g. "HPA axis", "gut", "thyroid axis")
- `dietary_pattern` — e.g. "Mediterranean", "low-FODMAP", "protein-forward breakfast"

## Relationships

Relationships are directed and typed. Allowed types:

- `causes` — source causally drives target
- `indicates` — source being present suggests target (diagnostic pointer)
- `treats` — source is used therapeutically against target
- `precedes` — source must be addressed before target (clinical sequencing)
- `contraindicates` — source is a reason NOT to use target
- `part_of` — source is a component of target (structural/taxonomic)
- `correlates_with` — source tends to appear alongside target without
  implying causation
- `worsens` — source exacerbates target
- `improves` — source improves target (weaker than `treats`)
- `requires` — source depends on target (e.g. thyroid hormone synthesis
  requires iron)

Pick the narrowest accurate type. Prefer `treats`/`improves`/`precedes`
over `correlates_with` when the item explicitly supports them.

## Output contract

Return ONLY a valid JSON object with this shape:

```
{
  "concepts": [
    {
      "concept_type": "symptom|condition|lab_marker|supplement|intervention|body_system|dietary_pattern",
      "name": "canonical lowercase name",
      "description": "string | null — 1 sentence description drawn from the source items"
    }
  ],
  "relationships": [
    {
      "source": { "concept_type": "...", "name": "..." },
      "target": { "concept_type": "...", "name": "..." },
      "relationship_type": "one of the allowed types",
      "strength": 0.0,
      "evidence": "string — the clinical reasoning from the source items that supports this edge"
    }
  ]
}
```

## Rules

- `name` must be canonical and lowercase. Normalize variants:
  "magnesium glycinate" (not "Mag Glycinate"), "hpa axis" (not
  "HPA-axis"), "ferritin" (not "Ferritin (serum)").
- Every concept appearing in `relationships.source` or `target` must also
  appear in `concepts`.
- `strength` is a float in 0..1 reflecting confidence in the relationship
  based on how directly the source items support it:
  - 0.9+ explicit statement ("address gut before hormones")
  - 0.7-0.9 strongly implied
  - 0.5-0.7 inferable but not stated
  - <0.5 do not include
- Do NOT invent relationships not supported by the source items.
- Do NOT echo patient identifiers if any appear in the source items.
- If an item is ambiguous, skip it rather than guessing.
