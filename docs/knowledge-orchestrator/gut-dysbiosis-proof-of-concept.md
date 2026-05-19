# Gut Dysbiosis — Knowledge Orchestrator Proof of Concept

**Purpose:** Demonstrate what a research agent's structured output looks like when cross-referencing multiple trusted leaders on a single domain. This is the template for how the Knowledge Orchestrator will process and present knowledge for all 6 domains.

**Domain:** Gut Health / Dysbiosis  
**Leaders referenced:** Huberman, Patrick, Cole, Hyman, Szal/Gottfried, Holmes  
**Last updated:** 2026-05-03

---

## 1. Cross-Referenced Knowledge Entries

Below is what the research agent would extract, structured as entries that map to the `clinical_knowledge` table with leader provenance and domain tags.

### Entry 1: Root Causes of Gut Dysbiosis

| Leader | Position | Emphasis | Confidence |
|--------|----------|----------|------------|
| **Huberman** | Low microbial diversity + tight junction breakdown → leaky gut → neuroinflammation. 90-95% of serotonin produced in gut. | Gut-brain axis, neurotransmitter disruption | 0.75 |
| **Patrick** | Altered microbial metabolites and immune signaling → systemic inflammation linked to obesity, depression, autoimmune disorders | Immune/metabolite pathways, research-driven | 0.80 |
| **Cole** | Bacterial overgrowth and imbalance (often SIBO), driven primarily by diet — sugar, alcohol, processed foods | Clinical diagnosis, SIBO-specific | 0.90 |
| **Hyman** | Food quality and nutrient deficiency as root drivers | Broad functional medicine lens | 0.85 |
| **Szal** | Gut microbiome "conducts" hormonal balance; dysbiosis is foundational to hormone dysregulation | Hormone-gut connection, estrobolome | 0.85 |
| **Holmes** | Circadian disruption and sleep deprivation actively reshape gut microbial composition | Sleep-gut feedback loop | 0.75 |

**Consensus level:** HIGH — all leaders agree dysbiosis is multifactorial. No direct contradictions.  
**Unique angles:** Huberman (neuro), Szal (hormones), Holmes (sleep) each add a dimension the others don't cover.  
**Domain tags:** `pattern_recognition`, `clinical_sequencing`

---

### Entry 2: Testing Approaches

| Leader | Recommended Tests | Notes |
|--------|-------------------|-------|
| **Cole** | Comprehensive stool analysis + SIBO breath test (hydrogen/methane) | Most test-specific of all leaders |
| **Hyman** | Functional medicine panels: dysbiosis markers + food sensitivity panels | Broad panel approach |
| **Patrick** | Diversity metrics, immune markers (CRP, inflammatory profiles), microbiome sequencing | Research-grade, less clinic-practical |
| **Huberman** | Less specific — symptom assessment + dietary response | Behavioral-first approach |
| **Szal** | Referenced in hormone context, not gut-specific testing | Defers to GI specialists |
| **Holmes** | HRV, sleep metrics as proxy indicators for gut health | Novel — indirect measurement |

**Consensus level:** MODERATE — Cole and Hyman agree on functional testing. Others take different approaches.  
**Conflict flag:** Patrick's research-grade approach may not be practical for clinical use. Cole's SIBO-specific testing is the most actionable.  
**Domain tags:** `pattern_recognition`

---

### Entry 3: Treatment Sequencing (THE CRITICAL INSIGHT)

**Framework:** The 5R Protocol — widely used by Cole and Hyman:

```
1. REMOVE  → offending foods + antimicrobials targeting specific pathogens
2. REPLACE → digestive enzymes, HCl, bile support
3. REINOCULATE → probiotics and prebiotics (TIMING MATTERS — see conflict below)
4. REPAIR  → intestinal barrier: L-glutamine, zinc, colostrum
5. REBALANCE → sustained lifestyle change
```

| Leader | Sequencing Position |
|--------|-------------------|
| **Cole** | Strict 5R order. **Critical warning:** probiotics BEFORE clearing pathogens can WORSEN SIBO. Must clear first, then reinoculate. |
| **Hyman** | 5R framework but more flexible on timing. Reinoculation can start earlier. 70% symptom reduction within 10 days of food removal. |
| **Szal** | Gut must be healed BEFORE addressing hormones. Dysbiosis → estrobolome dysfunction → hormone imbalance. Gut-first always. |
| **Huberman** | Behavioral-first: fermented foods (2-4 servings/day), sleep, stress reduction. Less structured protocol. |
| **Holmes** | Sleep correction first — poor sleep actively destroys gut microbiome. Fix sleep architecture before gut protocol. |
| **Patrick** | Lifestyle foundation (stress, sleep, exercise) alongside targeted supplementation. |

**Domain tags:** `clinical_sequencing`, `prerequisite_mapping`

---

### Entry 4: Key Supplements & Interventions

| Supplement/Intervention | Leader(s) | Use Case | Sequencing Note |
|------------------------|-----------|----------|-----------------|
| **Fermented foods** (kimchi, sauerkraut, kombucha) | Huberman | Restore microbial diversity, reduce inflammation markers | 2-4 servings daily, ongoing |
| **Antimicrobial herbs** (berberine, oregano oil, etc.) | Cole | Clear bacterial overgrowth (SIBO) | Phase 1 — BEFORE probiotics |
| **L-Glutamine** | Cole, Hyman | Intestinal barrier repair | Phase 4 (Repair) |
| **Zinc** | Cole, Hyman | Tight junction support | Phase 4 (Repair) |
| **Colostrum** | Cole | Immune + barrier support | Phase 4 (Repair) |
| **Digestive enzymes** | Hyman, Cole | Replace digestive capacity | Phase 2 (Replace) |
| **HCl (Betaine)** | Hyman | Low stomach acid correction | Phase 2 (Replace) |
| **Prokinetics** (ginger, low-dose erythromycin) | Hyman | Prevent SIBO recurrence | Post-protocol maintenance |
| **Probiotics** | All (with caveats) | Reinoculation | AFTER pathogen clearance (Cole) or concurrent (Hyman) |
| **Sleep optimization** | Holmes, Huberman | Indirect gut repair via circadian restoration | Foundation — concurrent with all phases |

**Domain tags:** `dynamic_supplementation`, `delivery_method_intelligence`, `clinical_sequencing`

---

### Entry 5: Diet Recommendations

| Leader | Protocol | Duration | Key Rules |
|--------|----------|----------|-----------|
| **Cole** | 60-day elimination diet | 60 days | Remove gluten, dairy, grains, sugar, alcohol. Systematic reintroduction. |
| **Hyman** | 2-10 day reset | 2-10 days | Faster feedback loop. Remove processed foods + refined sugar. |
| **Huberman** | Fermented food protocol | Ongoing | 2-4 servings fermented foods daily. No strict elimination. |
| **Patrick** | No single diet prescribed | Varies | Macronutrient composition must support microbial diversity. |
| **Cole/Hyman** | Pegan Diet (paleo-vegan fusion) | Long-term | Post-elimination maintenance approach. |

**Conflict flag:** Cole's 60-day elimination is 6-30x longer than Hyman's 2-10 day reset. Different patient types may need different approaches.  
**Domain tags:** `focused_lifestyle_coaching`

---

## 2. Identified Conflicts

### Conflict #1: Probiotic Timing (CLINICAL SIGNIFICANCE: HIGH)

| | Cole's Position | Hyman's Position |
|---|---|---|
| **Claim** | Probiotics BEFORE clearing bacterial overgrowth can WORSEN SIBO | Reinoculation can begin earlier in the 5R sequence |
| **Reasoning** | Adding bacteria to an already overgrown environment feeds the problem | Earlier reinoculation with the right strains can accelerate healing |
| **Source** | *Gut Feelings*, clinical telehealth practice | Doctor's Farmacy podcast, 5R framework teachings |

**Resolution type:** `context_dependent`  
**Resolution context:**
```json
{
  "if_sibo_positive": "cole_approach — clear first, then probiotics",
  "if_sibo_negative_dysbiosis": "hyman_approach — earlier reinoculation safe",
  "if_uncertain": "test_first — SIBO breath test before deciding",
  "dr_laura_pending": true
}
```
**Review needed:** Dr. Laura should weigh in on her clinical experience with probiotic timing in SIBO vs. non-SIBO dysbiosis.

---

### Conflict #2: Elimination Diet Duration (CLINICAL SIGNIFICANCE: MODERATE)

| | Cole's Position | Hyman's Position |
|---|---|---|
| **Claim** | 60-day elimination for thorough identification | 2-10 day reset for faster patient feedback |
| **Reasoning** | Some sensitivities take weeks to manifest | Most patients show 70% improvement in 10 days; longer = lower compliance |

**Resolution type:** `context_dependent`  
**Resolution context:**
```json
{
  "if_autoimmune": "cole_60day — autoimmune patients need longer elimination",
  "if_general_dysbiosis": "hyman_10day — faster feedback, higher compliance",
  "if_high_commitment_patient": "cole_60day — patient can handle it",
  "if_low_commitment_patient": "hyman_10day — compliance > thoroughness",
  "dr_laura_pending": true
}
```

---

### Conflict #3: What Comes First — Gut or Lifestyle Foundation? (CLINICAL SIGNIFICANCE: HIGH)

| | Cole/Hyman Position | Holmes/Huberman Position |
|---|---|---|
| **Claim** | Food removal is the highest-leverage first step | Sleep/circadian correction must come first — poor sleep destroys gut microbiome |
| **Reasoning** | Direct removal of inflammatory triggers produces fastest results | Without sleep foundation, gut interventions are undermined |

**Resolution type:** `context_dependent`  
**Resolution context:**
```json
{
  "if_sleep_severely_disrupted": "holmes_approach — fix sleep first",
  "if_sleep_adequate": "cole_hyman_approach — dietary intervention first",
  "if_both_disrupted": "simultaneous — gentle food removal + sleep hygiene together",
  "note": "This maps to Clinical Signal's phased approach — Phase 0 is always foundations",
  "dr_laura_pending": true
}
```

---

## 3. Prerequisite Map (Domain: `prerequisite_mapping`)

This is the dependency graph that emerges from cross-referencing all leaders:

```
Sleep Architecture (Holmes)
  └── Gut Microbiome Diversity (all leaders)
        ├── Pathogen Clearance (Cole)
        │     └── Probiotic Reinoculation (Cole, Hyman)
        │           └── Barrier Repair (Cole, Hyman)
        │                 └── Sustained Rebalance (all)
        └── Dietary Reset (Cole, Hyman, Huberman)
              └── Food Sensitivity Identification (Cole)

Gut Health (this entire chain)
  └── Hormone Optimization (Szal)
        └── HPA Axis Recovery
              └── Sex Hormone Balancing
```

**Key insight for Clinical Signal's protocol engine:** The prerequisite chain is: Sleep → Gut → Hormones. This is the "clinical sequencing" that functional medicine practitioners think in, and it directly informs how Output B (phased client plan) should be structured.

---

## 4. What This Proves

This proof of concept demonstrates:

1. **Cross-referencing works** — Different leaders bring genuinely different perspectives (neuro, hormones, sleep, clinical, research, nutrition) that enrich the knowledge base beyond any single source.

2. **Conflicts are identifiable and resolvable** — The 3 conflicts found are all `context_dependent`, meaning the right answer depends on the patient. This is exactly the kind of intelligence that makes Clinical Signal's protocols better than generic AI.

3. **Prerequisite maps emerge naturally** — Cross-referencing reveals a treatment dependency graph that maps directly to phased protocol generation.

4. **Dr. Laura's review is targeted** — Instead of reviewing thousands of entries, she reviews 3 specific conflicts with clear context. Her answers become the highest-confidence entries.

5. **The schema supports it** — Every element in this PoC maps to the schema designed in the companion document: `clinical_knowledge` entries with `leader_id` + `domains[]`, `knowledge_conflicts` with `resolution_context`, and `knowledge_review_queue` items.

---

## 5. Next Steps

1. **Dr. Laura review session** — Present the 3 conflicts above and get her positions
2. **Ingest Cole's *Gut Feelings*** — Highest-density gut health source, extract structured entries
3. **Build the research agent** — Automate this cross-referencing process for the remaining 5 domains
4. **Write migration 0016** — Implement the schema design in the actual database
5. **Build review queue UI** — So Dr. Laura can answer review briefs through the app
