# Lifetime Health Ontology: Market Research & Feasibility

**Prepared for Ryan — April 2026**

---

## The Idea

A platform that tracks health from birth using child + parent DNA, vaccines, labs, medications, diet, and wearable data. Maps hereditary risks, ideal nutrition, medication contraindications, and wellness trajectories across a lifetime. "Evernote for your health and wellness" — but with genetic intelligence.

---

## The Big Picture: Is Anyone Doing This?

**Short answer: No one has cracked it.** The pieces exist in isolation, but no platform combines genomics + longitudinal health tracking + functional health insights + clinical sequencing into one product.

**Consumer genomics is collapsing.** 23andMe filed Chapter 11 bankruptcy in March 2025 after their stock fell from $300 to under $4. Nebula Genomics shut down entirely. The business model — one-time test, no ongoing engagement — doesn't work. These companies proved consumers *want* genetic health insights but failed to keep them coming back.

**Pharmacogenomics works but is narrow.** Genomind and GeneSight successfully use DNA to guide medication choices (primarily psychiatric meds), but they're provider-ordered point-of-care tests, not consumer platforms. No connection to broader health data.

**Longitudinal health records keep failing.** Google Health tried twice (2008 and 2018) and shut down both times. Apple Health Records aggregates data but doesn't analyze it. The lesson: passive data collection without action isn't compelling enough.

**Precision health platforms are fragmented.** InsideTracker (blood + DNA + wearables), Viome (microbiome), Wild Health (concierge genomics) — each does one slice well but none integrate everything. Wild Health shows clinical outcomes are possible (47.5% normalized A1C) but at $3,000-$10,000/year, it can't scale.

**Pediatric genomics is a complete white space.** Huckleberry tracks baby sleep/feeding for 5M+ families, but zero pediatric platforms incorporate genetics. No one is mapping child health with parental DNA context.

---

## Market Size

The addressable markets are massive and growing:

- **Precision medicine**: $120-550B projected by 2035 (16%+ CAGR)
- **Consumer genomics**: $1.87B in 2025, growing 20-25% annually
- **DTC genetic testing**: $4.5B in 2025, projected $11-13B by 2034
- **Digital health overall**: $288-427B in 2024, growing to $946B-1.3T by 2035
- **Employer wellness**: $94.6B by 2026, with documented 6:1 ROI ($462/employee/year savings)

Even capturing 0.5% of the precision medicine market = $600M-2.7B revenue opportunity.

---

## What Consumers Will Pay

Health app pricing data shows clear thresholds:

- **Health apps**: 59% of consumers willing to pay, median ~$6.50/month
- **Genetic testing**: 64% willing to pay $25+, but under 10% will pay $500+
- **Annual subscriptions**: $29.65 median for health/fitness apps
- **Premium tiers**: LTV jumps 7x with high-priced plans vs. low-priced

The DTC genetic testing market has driven prices from $999 down to $50-99 per kit. Consumers expect genetic testing to be cheap; the value must come from ongoing interpretation and action, not the test itself.

---

## B2B vs B2C: The Critical Decision

**D2C alone will fail.** Health apps lose 97% of users by day 30. Annual retention is only 16%. Monthly subscriptions show 17% retention. The 23andMe story proves this — they had 15 million users and still went bankrupt because engagement collapsed after the initial test.

**B2B through practitioners is the path.** This is Clinical Signal's existing model, and it works because:

- Practitioners create accountability (someone is watching your data)
- Clinical relationships are sticky (4-6 month engagements with daily messaging)
- Practitioners are the trust layer — patients follow their doctor's guidance
- Employer wellness programs pay $275/employee/year with documented ROI

**The winning model is B2B-B2C hybrid**: sell to practitioners and employers who become the anchor relationship, then the consumer stays engaged through their provider. This is exactly what Clinical Signal already does.

---

## Regulatory Reality Check

Genetic data is a regulatory minefield — more complex than standard HIPAA:

**Federal protections are weaker than most people think.** GINA (2008) prohibits health insurers and employers from using genetic data, but explicitly *excludes* life insurance, long-term care, and disability insurance. A study found 92.6% of people with "high GINA knowledge" incorrectly believed these areas were covered.

**States are moving fast.** Illinois has penalties up to $15,000 per intentional violation. Texas passed the Genomic Act in 2025 prohibiting genetic data sale to foreign adversaries during bankruptcy (direct response to 23andMe). Montana expanded protections to include neurotechnology data. Multiple states introduced new bills in early 2026.

**Genetic data can never be truly de-identified.** Unlike a password, DNA is permanent and uniquely identifying. HIPAA's safe harbor de-identification method explicitly cannot apply to genetic data. A breach exposes the person forever and also reveals information about their relatives who never consented.

**Children's genetic data is legally complex.** Parents can consent to testing, but legal scholars argue parents are fiduciaries of children's genetic data, not owners. The "right to not know" is an emerging principle — a child may later wish they'd never learned their genetic predispositions.

**FDA landscape is in flux.** The FDA attempted to regulate lab-developed genetic tests in 2024, got overruled by federal court in March 2025, and rescinded the rule in September 2025. Enforcement discretion continues, but regulatory tightening is likely.

**Bottom line**: You'd need explicit multi-step consent, AES-256 encryption, segregated genetic data stores with heightened access controls, audit logging, and specialized breach notification protocols. Budget for a genetic privacy attorney from day one.

---

## How This Fits with Clinical Signal

**Two strategic paths:**

### Path A: Clinical Signal Extension (Recommended)

Add genomics as a data source within Clinical Signal's existing practitioner workflow. Phase it in:

1. **Phase 1 (now)**: Clinical Signal MVP with lab PDF upload and protocol generation — already built
2. **Phase 2**: Accept genetic test results (23andMe raw data, clinical genetic tests) as an additional upload type alongside labs
3. **Phase 3**: Integrate pharmacogenomic insights into protocol generation ("based on CYP2D6 status, avoid X, prefer Y")
4. **Phase 4**: Longitudinal tracking across visits — the platform remembers what was tried, what worked, correlates with genetic markers
5. **Phase 5**: Parental genetic context for pediatric patients

**Advantages**: Builds on existing infrastructure, existing practitioner network, existing trust. Incremental engineering. Revenue from day one through Clinical Signal.

### Path B: Standalone Product ("HealthGraph" or similar)

Build a separate consumer-facing lifetime health platform with genetic intelligence.

**Advantages**: Bigger TAM, separate brand for consumer marketing, potentially higher valuation multiple.

**Disadvantages**: Requires consumer acquisition (expensive, high churn), separate regulatory compliance, separate engineering team, and the D2C genomics model has failed for every company that's tried it.

### My Recommendation

**Start with Path A.** Clinical Signal's practitioner network IS the moat. Every failed genomics company (23andMe, Nebula, Google Health) tried to go direct to consumers and couldn't sustain engagement. Clinical Signal solves this by routing through practitioners who create accountability. Once you have 1,000 practitioners using Clinical Signal with genetic data, *then* you have the user base, the clinical outcomes data, and the regulatory infrastructure to launch a consumer-facing product on top.

The investor pitch that works: *"Lifetime health ontology anchored to practitioners as the clinical operating system for personalized medicine. 23andMe proved consumers want genetic health insights. We proved they need a practitioner to actually act on them."*

---

## Key Risks

1. **Data liability compounds over decades** — a breach of 20 years of genetic + health data is catastrophic
2. **Science evolves** — genetic interpretations from 2026 may be wrong by 2036; you need continuous updating
3. **Genetic determinism backlash** — post-23andMe, consumers are skeptical; lead with environment + behavior, not "your genes say..."
4. **Retention** — even with practitioners, lifetime engagement is unproven; build data switching costs early
5. **Competitive moat erosion** — genetic data is commoditizing; differentiation must come from interpretation + workflow, not data

---

## Adjacent Revenue Opportunities

Beyond practitioner subscriptions:

- **Pharma data licensing**: GSK paid 23andMe $300M for access to 5M de-identified genomes. At scale, this is significant revenue.
- **Insurance partnerships**: Risk scoring using genetic + longitudinal health data for preventive underwriting.
- **Employer wellness**: Corporate programs pay $50-200/employee/year for health platforms.
- **Research partnerships**: Academic institutions pay for structured, consented health datasets.

---

## Bottom Line

The idea is sound, the market is massive, and the timing is good (23andMe's collapse = cautionary tale + open market). But the execution path matters enormously. D2C genomics alone is a graveyard. The winning play is Clinical Signal as the foundation — practitioners as the trust and distribution layer — with genomics as a powerful feature addition, not a standalone product. Build the practitioner network first, add genetic intelligence second.

Safe flight. We can dig deeper on any section when you land.
