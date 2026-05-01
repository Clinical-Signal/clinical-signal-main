# Knowledge Sources — Clinical Signal AI

This file tracks every data source that feeds the Clinical Signal AI's clinical reasoning. The knowledge base is our competitive moat — the richer and more nuanced it gets, the better the protocols we generate.

## How to add new sources

1. Drop files into the workspace (any format: PDF, DOCX, XLSX, transcripts, links)
2. Add a brief description of what the source is and why it matters
3. The AI ingests, extracts structured knowledge, and generates a review brief
4. Dr. Laura reviews the brief in a periodic session (30-60 min)
5. Her feedback becomes the highest-value entries in the knowledge base

## Source status key

- ✅ EXTRACTED — Knowledge entries generated and in the database
- 🔄 PARTIAL — Some content extracted, more remains
- ⏳ QUEUED — Source identified, extraction not started
- 🎯 PRIORITY — High-impact source, extract next
- ❓ NEEDS CONTEXT — Have the file but need Dr. Laura's input on how she uses it

---

## 1. Slack Mentorship Data (Dr. Laura's training community)

The Slack export contains 2+ years of Dr. Laura mentoring 35+ practitioners. Rich in clinical reasoning, case discussions, and protocol guidance.

### Extracted channels

| Channel | Rich threads | Entries | Notes |
|---------|-------------|---------|-------|
| clientfeedbackrequests | 402 | 671 | **Goldmine.** Real cases with labs + Dr. Laura's clinical reasoning |
| supplements | 176 | 87 | Dosing, brands, sequencing |
| hormones | 152 | 158 | Sex hormones, thyroid, adrenal |
| gut-health | 106 | 80 | GI MAP interpretation, eradication protocols |
| coachingskills | 52 | 36 | How to communicate protocols to patients |
| biohacking_and_longevity | 35 | — | Longevity protocols, testing |
| nutrition-and-meal-planning | 34 | — | Dietary frameworks |
| protocols | 31 | 24 | Protocol structure and sequencing |
| serum_testing | 30 | 40 | Blood panel interpretation |
| detox | 29 | 22 | Detox protocols, binders, sequencing |
| skin | 17 | — | Skin-gut-hormone connections |
| metabolic-health-and-blood-sugar | 14 | — | Insulin resistance, blood sugar |
| case-studies | 14 | — | Structured case walkthroughs |
| fat-loss-and-metabolism | 14 | — | Weight loss resistance |
| chronicdisease | 13 | — | Complex chronic cases |
| sleep | 12 | — | Sleep protocols |
| fertility | 10 | — | Fertility optimization |
| fitness-and-exercise | 10 | — | Exercise prescriptions |
| brain-health | 9 | — | Cognitive health |
| nervoussystemregulation | 7 | — | Nervous system, vagal tone |
| peptides | 5 | — | Peptide protocols |
| plant-medicine | 2 | — | CBD, microdosing |

### Unextracted channels (queued)

| Channel | Rich threads | Priority | Notes |
|---------|-------------|----------|-------|
| livecallschedule-topics | 138 | 🎯 HIGH | Q&A prep, clinical topics from live calls |
| call_replays | 42 | 🎯 HIGH | Clinical reasoning from recorded sessions |
| announcements | 117 | MEDIUM | Mix of program updates + clinical tips |
| booksandresources | 59 | MEDIUM | Reference materials Dr. Laura recommends |
| entrepreneurgrowthtopics | 64 | LOW | Business growth, not clinical |
| collaborations-and-referrals | 38 | LOW | Referral patterns |
| systemsandprocesses | 35 | LOW | Practice operations |
| celebrations | 25 | SKIP | Wins and kudos |
| welcome | 20 | SKIP | Onboarding |
| money | 14 | SKIP | Pricing/revenue |
| mindset | 13 | LOW | Coaching mindset |
| urgent | 7 | SKIP | Admin |
| hormoneai | 6 | MEDIUM | Small but directly relevant to our AI |
| products-and-brands-we-love | 6 | MEDIUM | Preferred supplement brands |

**Current totals: 1,217 knowledge entries from Slack data**

---

## 2. Course Materials & Training Docs (⏳ QUEUED)

Dr. Laura's structured teaching content — the codified version of her clinical methodology. This is the highest-value source type because it represents her deliberate, organized thinking vs. informal Slack responses.

**What we need:**
- Slide decks from her training program
- Written guides / student handouts
- Certification materials
- Any structured decision trees or flowcharts she's created

**Format:** PDF, PPTX, DOCX — anything works

**Priority:** 🎯 HIGHEST — This is the backbone of her methodology

---

## 3. Recorded Calls & Transcripts (⏳ QUEUED)

Live coaching calls, case study walkthroughs, Q&A sessions. These capture Dr. Laura's real-time clinical reasoning — how she thinks through a case step by step.

**What we need:**
- Audio/video files OR existing transcripts
- Case study call recordings
- Live coaching Q&A sessions

**Format:** MP3/MP4 (we'll transcribe), or text transcripts if already done

**Priority:** 🎯 HIGH — Second richest source after course materials

---

## 4. Clinical Reference Documents (⏳ QUEUED)

The "cheat sheets" practitioners actually use in practice. These define Dr. Laura's standards and preferences.

**What we need:**
- Lab interpretation guides (functional ranges, not just standard reference ranges)
- Supplement dosing charts (specific products, doses, timing)
- Protocol templates (what she uses as starting points for common conditions)
- Preferred brand lists (which supplement companies she trusts and why)
- Clinical decision trees (if X labs + Y symptoms → Z protocol)

**Format:** PDF, XLSX, DOCX — anything works

**Priority:** 🎯 HIGHEST — Directly feeds protocol generation quality

---

## 5. Research & Articles She Trusts (⏳ QUEUED)

Knowing which sources Dr. Laura references teaches the AI her clinical philosophy and evidence base. Equally important: knowing which popular sources she *disagrees* with.

**What we need:**
- Papers/articles she references in teaching
- Textbooks or authors she recommends
- Sources she specifically disagrees with or considers outdated
- Any literature reviews or meta-analyses she considers definitive

**Format:** PDFs, links, or even a list of titles

**Priority:** MEDIUM — Adds depth but not as immediately actionable as her own materials

---

## Knowledge base quality metrics

| Metric | Current | Target |
|--------|---------|--------|
| Total knowledge entries | 1,217 | 5,000+ |
| Body systems covered | 12/12 | 12/12 ✅ |
| Entries with 3+ systems | 573 (47%) | 60%+ |
| Entries with conditions | 535 (44%) | 70%+ |
| Entries with supplements | 528 (43%) | 60%+ |
| Source: Slack mentorship | 1,217 | — |
| Source: Course materials | 0 | 500+ |
| Source: Call transcripts | 0 | 300+ |
| Source: Reference docs | 0 | 200+ |
| Source: Research articles | 0 | 100+ |
| Dr. Laura reviewed | 0 | 500+ |

---

## Review brief process

After each batch extraction, generate a review brief for Dr. Laura containing:

1. **What we extracted** — Summary of new entries by category and system
2. **Judgment questions** — 10-15 targeted questions where the AI needs her clinical opinion
3. **Contradictions found** — Cases where extracted knowledge conflicts
4. **Gaps identified** — Body systems or conditions with thin coverage
5. **Confidence calibration** — Entries where we're unsure if we captured her intent correctly

Her answers to these questions become `dr_laura_reviewed` entries — the highest-confidence items in the knowledge base.
