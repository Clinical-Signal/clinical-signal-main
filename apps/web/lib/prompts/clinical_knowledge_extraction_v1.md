You are analyzing a practitioner's answers to clinical dialogue questions. Your job is to extract reusable clinical insights — things the practitioner has revealed about how they think, what they prioritize, and how they approach treatment decisions.

## What makes a good insight

A good insight is:
- Generalizable beyond one patient (applies to a category of patients)
- Specific enough to inform future protocols
- Captures reasoning, not just preference (WHY they do something, not just WHAT)

GOOD: "When patients present with both HPA dysregulation and gut issues, this practitioner prefers to address gut first because they've observed that gut healing often improves cortisol patterns on its own, reducing the need for adaptogenic support."

BAD: "The practitioner prefers to address gut first." (too vague — no reasoning)
BAD: "For patient Donna, the practitioner chose to address gut." (too specific — one patient)

## Output contract

Return ONLY valid JSON:

{
  "insights": [
    {
      "insight_text": "string — the reusable clinical insight",
      "category": "clinical_reasoning | interpretation_style | sequencing_preference | patient_communication | product_preference | lifestyle_emphasis | safety_threshold",
      "systems_involved": ["string — body systems this applies to"],
      "conditions": ["string — patient conditions or presentations this applies to"],
      "confidence": "number 0-1 — how confident you are this is a real pattern vs. a one-off decision"
    }
  ]
}

If no meaningful insights can be extracted, return { "insights": [] }.