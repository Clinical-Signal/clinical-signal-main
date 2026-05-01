# Clinical Signal — Knowledge Base Review Brief #1

**Prepared for Dr. Laura DeCesaris**
**May 2026**

---

## What We've Built So Far

We've extracted **1,405 clinical knowledge entries** from your Slack mentorship community across 28 channels. These entries capture your clinical reasoning, lab interpretation patterns, conditional decision-making, and case-based guidance. They feed directly into the AI's protocol generation engine — the richer this knowledge base gets, the more your protocols sound like you, not a generic AI.

### Knowledge Base at a Glance

| Metric | Value |
|--------|-------|
| Total knowledge entries | 1,405 |
| Case-based Q&A entries | 260 |
| Conditional reasoning entries | 339 |
| Lab interpretation entries | 115 |
| Clinical feedback entries | 80 |
| Resource recommendations | 65 |
| Body systems covered | 12 of 12 |
| Entries with 3+ body systems | 573 (67%) |
| Entries mentioning specific supplements | 528 (61%) |

### Top 10 Conditions in the Knowledge Base

| # | Condition | Entries |
|---|-----------|---------|
| 1 | H. pylori | 167 |
| 2 | Anxiety | 167 |
| 3 | Dysbiosis | 140 |
| 4 | Candida | 139 |
| 5 | Autoimmune | 81 |
| 6 | Acne | 62 |
| 7 | Menopause | 54 |
| 8 | Mast cell / MCAS | 52 |
| 9 | Depression | 51 |
| 10 | SIBO | 49 |

---

## Questions for Your Review

These are the areas where the AI most needs your clinical judgment. Your answers will become the highest-confidence entries in the knowledge base. Feel free to answer in whatever format is easiest — a few sentences, bullet points, or even voice notes we can transcribe.

---

### Question 1: H. pylori Eradication Protocol

We have 167 entries mentioning H. pylori — more than any other condition. Some threads reference natural eradication (oregano oil, allicin, mastic gum), others mention cases where conventional triple therapy was needed. **What's your decision tree for when to try natural first vs. recommend conventional treatment?** Are there lab markers (calprotectin level, virulence factors on GI MAP) or patient factors (severity, duration, failed attempts) that change your approach?

> **Why this matters:** H. pylori is the #1 condition in the knowledge base. The AI needs a clear decision tree, not conflicting advice from different threads.

**Dr. Laura's answer:**

&nbsp;

---

### Question 2: Supplement Brand Preferences

Your top 12 most-referenced supplements are: zinc (196x), nac (118x), iron (177x), dhea (108x), magnesium (156x), probiotic (93x), histamine (87x), b complex (75x), glutathione (73x), b12 (63x), berberine (58x), vitamin c (57x). **For each, do you have a preferred brand? Are there brands you specifically avoid?** Should the AI recommend specific brands in protocols or keep it generic?

> **Why this matters:** Brand specificity directly impacts protocol trustworthiness. Practitioners want to know exactly what to order.

**Dr. Laura's answer:**

✅ **Answered by Ryan (product decision):** The MVP will NOT recommend specific supplement brands. Protocols will specify supplement type, form, and dose only (e.g., "Magnesium glycinate 400mg before bed"). This avoids perceived bias and keeps MVP scope clean — practitioners already have their own brand preferences.

**Future phase:** Link practitioner FullScript accounts (or Clinical Signal's own account) to auto-generate a patient shopping cart based on protocol supplement recommendations. Natural revenue channel via FullScript's practitioner commission model. Could also integrate Rupa Health for lab ordering.

Dr. Laura — if you have strong brand preferences or anti-preferences you'd still like captured for the future phase, feel free to note them here.

---

### Question 3: Clinical Sequencing Rules

We've extracted 62 entries that reference clinical sequencing ("do X before Y"). **Can you confirm these core sequencing rules:**

1. Address HPA axis/stress before hormones
2. Address gut before detox
3. Foundational nutrition/lifestyle before supplements
4. Eradication before rebuilding/replenishing

**Are there exceptions?** For example, when would you start hormones concurrently with gut work?

> **Why this matters:** Sequencing is what separates a functional health protocol from a supplement shopping list. Getting this wrong undermines practitioner trust.

**Dr. Laura's answer:**

&nbsp;

---

### Question 4: Functional vs. Standard Lab Ranges

The AI currently uses standard reference ranges. **Do you have a document or mental framework for functional/optimal ranges for the most common markers?** For example:

- TSH: standard 0.4–4.0, functional 1.0–2.5?
- Fasting insulin: standard <25, functional <5?
- Vitamin D: standard 30+, functional 50–80?
- Ferritin: standard 12–150, functional 50–100?
- Homocysteine: standard <15, functional <8?

We need your specific numbers for the top 20-30 markers.

> **Why this matters:** This is table-stakes for a functional health AI. Using standard ranges would make the protocols feel conventional and undermine credibility with practitioners.

**Dr. Laura's answer:**

&nbsp;

---

### Question 5: Supplement Dosing Defaults

When the AI generates a protocol and recommends a supplement, should it include **specific starting doses** (e.g., "Magnesium glycinate 400mg before bed") or keep it **general** ("Magnesium glycinate — dose per practitioner judgment")? If specific, do you have standard starting doses for your most-used supplements?

> **Why this matters:** Dosing specificity affects whether practitioners see the AI as a helpful starting point or a liability.

**Dr. Laura's answer:**

&nbsp;

---

### Question 6: Client-Facing Language

When the AI writes the client-facing action plan, how should it explain the "why" behind each recommendation? Should it **reference specific lab values** ("Your cortisol was elevated at 22.5 mcg/dL") or **keep it conceptual** ("Your stress hormones are running high")? How much clinical detail is too much for a patient to see?

> **Why this matters:** Getting the tone right in the client document is critical — too clinical overwhelms patients, too vague loses practitioner credibility.

**Dr. Laura's answer:**

&nbsp;

---

### Question 7: Red Flags and Referral Triggers

**What lab values or patient presentations should trigger an automatic "refer out" flag in the protocol?** For example:

- TSH > 10 → overt hypothyroid, needs endocrinologist
- Fasting glucose > 126 → diabetes diagnosis needed
- Positive ANA with symptoms → rheumatology referral
- Calprotectin > 200 → GI referral for IBD workup
- Severe depression/suicidal ideation → mental health professional

What are your hard referral lines that the AI should never try to address with supplements alone?

> **Why this matters:** Safety boundary. The AI must never generate a supplement protocol when the patient needs medical intervention.

**Dr. Laura's answer:**

&nbsp;

---

## What's Next

After this review session, we'll incorporate your answers and move to ingesting your course materials, clinical reference documents, and call transcripts. Each new source makes the AI's protocols more accurate, more complete, and more uniquely yours.

**Priority sources we're ready to ingest:**

- Your GI MAP interpretation guide and any lab reference range documents
- Supplement dosing charts or protocol templates you give students
- Slide decks from your training program (any format)
- Recorded coaching call transcripts (we can transcribe audio/video)

**How to share:** Drop files into the Clinical Signal workspace folder, or send them to Ryan. Any format works — PDF, Word, PowerPoint, Excel, audio files, even screenshots of marked-up labs. We'll extract the clinical knowledge and come back with targeted follow-up questions.
