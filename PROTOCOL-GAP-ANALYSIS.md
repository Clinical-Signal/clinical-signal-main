# Protocol Gap Analysis — Alpha Test (Donna G Patient)

**Issue #73 — Week 1 deliverable**

This documents every gap found when comparing the AI-generated protocol against Dr. Laura's hand-written protocol for the Donna G patient. Each gap is categorized and has a proposed fix.

---

## Summary

The AI did a good job on the clinical report's depth and detail. But the protocol missed critical data that was sitting right in front of it, and the output format doesn't match how Dr. Laura actually writes protocols. There are 8 gaps total: 3 are data problems (the AI didn't see the information), 3 are prompt problems (the AI saw it but didn't use it well), and 2 are architecture problems (the system is structured differently from how Dr. Laura actually works).

---

## Gap 1: GI Map Data Not Used

**What happened:** Dr. Laura uploaded the patient's GI Map stool test results, but the AI recommended ordering a GI Map — as if the test hadn't been done yet.

**Category:** DATA PROBLEM

**Root cause:** The `generate-protocol` route has its own `formatTimeline()` function that does NOT include uploaded documents (lab PDFs, transcripts, practitioner notes). Only the `analyze` route was fixed to include them. So the analysis step might see the GI Map, but the protocol generation step definitely does not.

**Code location:** `apps/web/app/api/patients/[id]/generate-protocol/route.ts` line 127 — this `formatTimeline()` lacks the `documentTexts` parameter that exists in the analyze route's version.

**Fix:** The generate-protocol route must include intake hub documents in its prompt, just like the analyze route does. Ideally, both routes should use the same shared `formatTimelineForPrompt()` function from `lib/analysis.ts` instead of having duplicate local copies.

**Priority:** P0 — this is the single most impactful fix for protocol quality.

---

## Gap 2: Call Transcript Nuances Missed

**What happened:** The practitioner added notes from the patient call before running the protocol. The AI didn't reference these observations, which Dr. Laura said "change the protocol plan quite a bit."

**Category:** DATA PROBLEM (same root cause as Gap 1)

**Root cause:** Same as Gap 1 — the generate-protocol route's `formatTimeline()` doesn't include practitioner notes or call transcripts from the Intake Hub.

**Fix:** Same fix as Gap 1. Once the generate-protocol route includes all document texts, call transcripts and practitioner notes will be visible to the AI. The prompt already instructs the AI to weight transcripts and notes heavily (see the analyze route's document text preamble).

**Priority:** P0 — bundled with Gap 1 fix.

---

## Gap 3: Oral/Nasal Microbiome Section Missing

**What happened:** Dr. Laura's protocol included a specific section on oral and nasal microbiome health — tongue scraping, Xlear nasal spray, Dentalcidin toothpaste. This came directly from patterns she spotted in the GI Map data about bacterial patterns in the mouth and nasal passages. The AI protocol had nothing about this.

**Category:** DATA PROBLEM + PROMPT PROBLEM

**Root cause:** Two factors: (1) the AI didn't see the GI Map data (Gap 1), so it couldn't spot the oral/nasal connection, and (2) even if it had the data, the clinical analysis prompt doesn't specifically instruct the AI to look for oral/nasal microbiome connections from GI Map findings.

**Fix:**
1. Fix Gap 1 (get the GI Map data into the prompt)
2. Add to the protocol generation prompt: "When GI Map data is present, evaluate for oral and nasal microbiome implications. Bacterial patterns in stool tests often indicate upstream colonization in the mouth and nasal passages. If relevant, include specific oral/nasal hygiene interventions."

**Priority:** P1 — depends on Gap 1 fix, then a prompt addition.

---

## Gap 4: Generic Recommendations Where Specifics Were Warranted

**What happened:** The AI gave general supplement categories ("consider a probiotic") where Dr. Laura named exact products: Klaire Therbiotic, Biocidin drops, Mastic Gum, MegaIgG, Saccharomyces boulardii.

**Category:** PROMPT PROBLEM

**Root cause:** The protocol generation prompt doesn't instruct the AI to name specific products. This is partly intentional (different practitioners prefer different brands) but partly a gap — Dr. Laura has specific product preferences that the AI should know about.

**Fix:** Two-part solution:
1. **Short-term (Week 2):** Add a practitioner preference section to the protocol prompt. Before generating, pull any product preferences the practitioner has set and include them as context: "This practitioner prefers: Klaire Therbiotic for probiotics, Biocidin for antimicrobials, etc."
2. **Long-term (Phase 3):** The clinical knowledge base (migration 0004) was built for exactly this. Dr. Laura's mentorship knowledge — including her specific product preferences and clinical reasoning — gets embedded and retrieved at protocol generation time.

**Priority:** P1 — the knowledge base already exists in the schema, just needs to be populated and wired into the protocol prompt.

---

## Gap 5: Protocol Structure Doesn't Match Dr. Laura's Format

**What happened:** Our system generates two separate outputs: Output A (clinical protocol for practitioner) and Output B (client action plan). But Dr. Laura's real protocol is ONE document written directly to the patient. It's warm and personal but still includes clinical specificity — exact supplement names, doses, timing, and rationale.

**Category:** ARCHITECTURE PROBLEM

**Root cause:** We designed the two-output model based on an assumption about how practitioners work. Dr. Laura's actual workflow is different — she writes one document that serves both purposes.

**Fix:** This needs a decision from Ryan and Dr. Laura. Options:
- **Option A:** Keep the two-output model but make the client-facing output much more clinically specific (closer to Dr. Laura's style — warm but detailed)
- **Option B:** Switch to a single output that matches Dr. Laura's format, with a separate "practitioner notes" section for clinical reasoning the patient doesn't see
- **Option C (recommended):** Generate the clinical protocol first (for practitioner review), then on approval, generate a single patient-facing document in Dr. Laura's style — warm, personal, clinically specific, organized by phases with daily meal timing structure

**Priority:** P1 — needs a design decision before Week 2 prompt rewriting.

---

## Gap 6: Missing "Layers Not Timelines" Approach

**What happened:** Dr. Laura's protocol works in "layers" — the patient moves to the next phase when symptoms stabilize, not on a fixed calendar. The AI protocol used time-based phases ("Week 1-2", "Week 3-4").

**Category:** PROMPT PROBLEM

**Root cause:** The protocol prompt doesn't instruct the AI to use symptom-based progression. It defaults to calendar-based phasing, which is how most health content is structured online.

**Fix:** Update the protocol generation prompt to explicitly instruct:
- "Structure phases as layers, not calendar weeks"
- "Each phase should define: what to do, why it matters, what success looks like, and when to move forward (based on symptom improvement, not time elapsed)"
- "Use language like 'When you notice [improvements], that's your signal to begin the next layer' rather than 'After 2 weeks, move to Phase 2'"

**Priority:** P1 — straightforward prompt change for Week 2.

---

## Gap 7: Daily Structure Missing

**What happened:** Dr. Laura's protocol is organized around the patient's day — morning routine, first meal, second meal, evening. The AI protocol was organized by clinical category (supplements, diet, lifestyle).

**Category:** PROMPT PROBLEM

**Root cause:** The prompt doesn't specify output structure at this level of detail.

**Fix:** Add to the protocol prompt: "Organize each phase around the patient's daily routine: morning/wake-up, first meal, midday/second meal, evening/wind-down. The patient should be able to read a phase and know exactly what to do at each point in their day. Include supplement timing relative to meals."

**Priority:** P1 — prompt change for Week 2.

---

## Gap 8: Supplementary Resources Are Separate (Not Protocol-Generated)

**What happened:** Dr. Laura sends supplementary resources alongside the protocol — a Nutrition 101 guide, a Circadian Alignment guide, a Carnivore Diet guide. These are reusable documents she sends to many patients, not generated fresh each time.

**Category:** ARCHITECTURE PROBLEM

**Root cause:** We don't have a concept of a "resource library" — reusable documents the practitioner can attach to any protocol.

**Fix:** This is a Phase 2 feature. Design:
- Practitioners upload their standard resources (PDFs, guides, handouts)
- When delivering a protocol, they can attach relevant resources from their library
- The AI can suggest which resources to attach based on the protocol content

**Priority:** P2 — not blocking MVP, but important for the practitioner experience.

---

## Fix Priority Summary

| Priority | Gap | Category | Fix Effort |
|----------|-----|----------|------------|
| P0 | #1, #2 — Documents not included in protocol prompt | Data | 1 day (share formatTimeline function) |
| P1 | #3 — Oral/nasal microbiome | Data + Prompt | Half day (prompt addition after P0 fix) |
| P1 | #4 — Generic vs. specific products | Prompt | 1 day (preference system + prompt update) |
| P1 | #5 — Output format mismatch | Architecture | Design decision needed, then 1-2 days |
| P1 | #6 — Layers not timelines | Prompt | 2 hours (prompt rewrite) |
| P1 | #7 — Daily structure missing | Prompt | 2 hours (prompt rewrite) |
| P2 | #8 — Resource library | Architecture | Phase 2 feature |

**Week 2 plan:** Fix P0 first (Gaps 1-2), then rewrite prompts to address Gaps 3, 6, and 7. Gap 5 needs a design decision. Gap 4 depends on populating the knowledge base.

---

## Still Needed

To complete this analysis, I need from Ryan:
- Dr. Laura's actual hand-written protocol for Donna G (her version)
- The AI-generated protocol for the same patient
- This will let me do a line-by-line comparison and catch any gaps I've missed
