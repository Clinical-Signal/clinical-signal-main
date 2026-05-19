# Cost Impact — MVP Scope Update (rev 6)

**Created:** May 10, 2026
**Purpose:** Quantify the cost deltas from the rev 6 scope changes (Layer D added, KO ingestion realities surfaced, conflict surfacing inline) so the existing Cost Analysis spreadsheet can be updated accordingly.

This is a delta against `Clinical-Signal-Production-Cost-Analysis.xlsx`. Fold the numbers below into the spreadsheet manually or have Claude Code do it.

---

## Summary

| Cost category | MVP-window total | Per-practitioner monthly steady-state | Notes |
|---|---|---|---|
| Layer C — KO ingestion (one-time + ongoing) | $200-400 | ~$5-15 ongoing | Higher than original estimate due to faithfulness-check cost on transcript content |
| Layer D — practitioner storage + extraction | ~$2-5 per practitioner one-time at typical content volume | ~$1-3 per practitioner monthly | New in rev 6 |
| Layer D — S3 storage for raw files | ~$0.10/GB/month | Negligible at small scale | New in rev 6 |
| Conflict surfacing (C.3.3) | ~$0 incremental | Negligible | Pure engineering, no LLM cost beyond what's already happening |
| Increased ingestion volume (multi-leader books) | ~$100-200 | n/a (one-time per leader) | First MVP-window books only — Gottfried + Cole + maybe Hyman top 3 |

**Net new cost over original prioritization:** roughly **+$100-300 one-time** (new Layer D + cost realities of faithfulness check we discovered) and **+$1-5/practitioner/month** in steady state. Not material for MVP-window economics.

---

## Layer C — KO ingestion costs (revised numbers from C.1.4 finding)

The C.1.4 work (faithfulness check) surfaced that the original $3-5/1k entry estimate was wrong by ~30-50× for transcript content. Real numbers based on the integration test:

| Source type | Cost per 1,000 entries | Reason |
|---|---|---|
| Slack-style chunks (~2-3k tokens) | $15-20 | Small input, small output |
| Book chapters (~5-10k tokens, structured) | $30-60 | Mid-size input, structured chunks |
| Transcripts (~25k tokens) | $155 | Input dominates; many entries-per-chunk amplifies |

**MVP-window ingestion costs (estimated):**

| Source | Estimated entries | Cost |
|---|---|---|
| Remaining queued Slack channels (5 channels × ~150 entries/channel) | ~750 | ~$12-15 |
| Course materials (Dr. Laura's training docs — TBD volume) | ~200-500 | ~$5-15 |
| Recorded calls / transcripts | ~100-300 | ~$15-50 (if any are large transcripts) |
| Gottfried *Hormone Cure* | ~50-100 | ~$5-15 |
| Cole *Gut Feelings* | ~50-100 | ~$5-15 |
| Hyman top 3 books (if added) | ~150-300 | ~$15-45 |
| **Total MVP-window ingestion** | ~1,300-2,300 entries | **~$60-160** |

Plus the existing 1,144 dev-DB entries (already ingested at older lower cost; retroactive faithfulness on production corpus per #180 is ~$20-30 one-time).

**Steady-state ongoing ingestion** (post-MVP, per month, per active leader):
- ~$5-15/month if one leader is being actively ingested across podcast episodes / new content
- ~$30-50/month if multiple leaders' new content is flowing in

Per-practitioner cost share: spread across all subscribed practitioners, this is a few dollars per practitioner per month at any reasonable scale. Not a per-practitioner direct cost — it's a shared platform cost.

**Optimization filed (#178):** source-relevant sentence extraction before faithfulness check — projected 5-10× cost reduction for transcript content. Worth doing before any large-scale transcript ingestion campaign. Not blocking for MVP.

## Layer D — per-practitioner extensibility (NEW in rev 6)

Each practitioner uploads their own content. Costs scale per-practitioner, not platform-wide.

**Per-practitioner one-time ingestion** (when they first onboard and bulk-upload):

Assuming a typical practitioner uploads ~30-50 documents (sample protocols, methodology docs, case notes) totaling ~200-500 pages:

- Text extraction (PDF/DOCX → text): negligible cost, runs locally with libraries
- Chunking + embedding: ~500-1,500 entries depending on content volume
- Faithfulness check on each: ~$15-30 in API spend (using book-chapter-style cost since their content is mostly structured docs)
- **Total per-practitioner Layer D one-time:** ~$15-30

**Per-practitioner ongoing** (incremental uploads over time):
- ~$1-3/month typical (occasional new docs added)
- Could be higher for actively-evolving practitioners

**Cross-practitioner cost contagion:** zero — Layer D content for one practitioner has no cost impact on others.

## Layer D — S3 storage costs

Raw files (originals) + extracted text files stored in S3.

- Typical practitioner: ~50-200 MB across all their uploads
- S3 standard storage: $0.023/GB/month
- 100 practitioners × 100 MB average = 10 GB = **$0.23/month total**
- Even at 1,000 practitioners × 200 MB average = 200 GB = ~$5/month

Negligible at MVP scale. Worth tracking as the product grows but not a meaningful line item until 5,000+ practitioners.

## Conflict surfacing (C.3.3) cost

Inline conflict detection runs at protocol generation time. Cost components:

- Cross-layer query against retrieved entries: pure SQL, no LLM
- Conflict detection heuristic (`relationship_type` comparison): pure SQL, no LLM
- Embedding-based contradiction detection (the deferred C.3.4 piece): would add LLM cost, but deferred to iteration 2
- Persisting practitioner resolutions: pure SQL

**Net incremental cost: ~$0.** Pure engineering work, no API spend.

## Net delta vs. original prioritization

| Item | Original cost estimate | Revised cost | Delta |
|---|---|---|---|
| KO ingestion MVP-window | $20-50 (rough guess from earlier convo) | $60-160 | +$40-110 |
| KO retroactive faithfulness on prod | not estimated | $20-30 | +$20-30 |
| Layer D engineering (one-time NRE) | $0 (didn't exist) | n/a (engineering effort, not API spend) | engineering time only |
| Layer D per-practitioner onboarding | $0 (didn't exist) | $15-30/practitioner | new cost class |
| Layer D ongoing per-practitioner | $0 (didn't exist) | $1-3/month/practitioner | new cost class |
| Layer D S3 storage | $0 (didn't exist) | <$5/month total at MVP scale | negligible |

**Net new cost over original prioritization for MVP launch:** roughly **+$60-140 one-time** (KO costs adjusted upward + retroactive on prod corpus). Plus **+$15-30 per practitioner onboarded** (Layer D).

For the first 10 practitioners (Dr. Laura's network beachhead), Layer D adds ~$150-300 in onboarding API spend. Trivial relative to revenue ($49/practitioner/month × 12 months = ~$5,880 from those 10 practitioners in year one).

## What this doesn't cover

- **Engineering effort cost** (developer time on Layer D + multi-leader ingestion + conflict surfacing) — covered in the prioritization doc as time estimates, not dollar costs
- **Aptible / S3 baseline infrastructure** — already in the existing cost analysis spreadsheet
- **Anthropic API usage for protocol generation itself** — already in the existing spreadsheet
- **BAA / legal / compliance one-time costs** — not in scope for this delta

## Recommended action

Open `Clinical-Signal-Production-Cost-Analysis.xlsx` and add three line items:

1. **KO ingestion (revised)** — recurring monthly cost ~$5-15, plus one-time MVP-window cost $60-160
2. **Layer D per-practitioner onboarding** — one-time cost per practitioner $15-30
3. **Layer D per-practitioner ongoing** — recurring monthly cost $1-3 per active practitioner

Update the per-practitioner unit economics rows to reflect Layer D's marginal cost. Margin impact at $49/month base + $20/client tier should still be healthy at the 15-20 client mark Dr. Laura's network is targeting.

If you want me to write the updated spreadsheet content as a CSV / SQL fragment that can be pasted in, ask. Otherwise update manually based on the deltas above.
