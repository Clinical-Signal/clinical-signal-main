# Practitioner Override, Learning, and Multi-Source Data Ingestion — Design

**Created:** May 19, 2026
**Status:** Strategic design — captures the foundational architecture for Layer D done right
**Author:** Cowork planning session with Ryan
**Supersedes:** Layer D sections of `docs/MVP-PRIORITIZATION-2026-05-08.md` rev 7 and `docs/LAYER-D-PRACTITIONER-EXTENSIBILITY.md`
**Companions:** `CLAUDE.md` (moat framing), `docs/HISTORICAL-BATCH-INGEST-DESIGN.md` (Layer 1 content sequencing)

---

## What this doc is

A consolidated design for two intertwined systems that, together, become Layer D of the moat:

1. **The protocol override and learning loop** — practitioners audit, override, and edit recommendations on a per-patient basis. The system observes the override patterns, surfaces them back to the practitioner via conversational dialogue, and codifies them as reusable rules. Over time, Clinical Signal becomes a co-pilot that has internalized each practitioner's clinical voice.

2. **Multi-source patient data ingestion with smart matching and learning** — instead of manual upload, the system pulls patient data from the practitioner's existing sources (cloud drives, email, lab platforms, eventually EHRs), uses a matching algorithm to suggest which files belong to the current patient, surfaces the candidates with confidence scores, and learns over time which sources and patterns matter for this practitioner.

Both systems share a single underlying pattern: **observe what the practitioner does, ask the right question at the right moment, structure the answer, persist, apply, audit.** This is the Claude-skills creation pattern applied to clinical practice. Once a practitioner has been using Clinical Signal for six months, they cannot trivially switch to a competitor because the competitor has no record of the hundreds of micro-decisions that shaped their version of the system.

This is the durable defensive moat. The original Layer D framing ("practitioner uploads their PDFs to a private knowledge layer") is replaced by this design. Document upload becomes one input channel within the broader system, not the system itself.

---

## Part I — Strategic framing

### The positioning shift

The market for "AI helps clinicians write protocols" will be crowded within 18 months. The market for "AI that internalizes each practitioner's clinical voice and gets smarter the more they use it" is much narrower and far more defensible. The features in this doc are what move Clinical Signal from category one to category two.

Two practitioner trust loops are at the heart of this. First: trust the recommendation. The practitioner needs to see *why* a recommendation was made — which patient inputs and which KB entries informed it. Without that, the system is a black box and recommendations are accepted or rejected on intuition alone. Second: trust that the system learns. When a practitioner overrides a recommendation, the system should recognize the pattern and offer to internalize it. Without that, every override is a one-off and the system stays generic forever.

Both loops require the same architectural foundation: structured provenance, override actions with audit, and a conversational layer that can ask clarifying questions at the right moments.

### Why this is foundational, not a feature

A standard product roadmap treats audit trails and override capability as polish or post-launch additions. This design treats them as the spine of the practitioner experience. The reasoning: every other product surface (protocol generation, patient management, settings) only makes sense in the context of a practitioner who can audit and customize. If the practitioner can only accept or wholesale-reject the system's output, the system has no path to becoming theirs. Once the override/learning loop exists, every other feature compounds against it.

### The two learning loops

**Protocol-side loop:** practitioner overrides a recommendation → system observes → at logical moments asks "should this apply more broadly?" → cohort defined → rule persists → applied to future protocols → audited in protocol provenance.

**Data-source-side loop:** practitioner adds a file the system didn't suggest, or removes one it did → system observes the pattern → asks "are files from <source pattern> usually relevant?" → answer persists as a source-confidence weight → applied to future data matching → audited in source selection.

Same loop shape, different domains. Both produce per-practitioner state that compounds over time. Both run on the same conversational substrate.

---

## Part II — The audit and override surface

This is the foundation that everything else depends on. Without structured provenance and override actions, neither learning loop has anything to observe.

### Sub-system 1: structured source provenance in protocol outputs

The protocol-generation prompt is modified to require structured JSON output. Every recommendation carries a `source_refs` array tagging:

- Patient inputs that informed it: lab marker name + value + uploaded document reference (with page anchor where applicable), intake question + answer, intake document + section, prior protocol if relevant
- KB entries that informed it: entry UUID, title, channel/source citation, confidence score

Current state: prompt prose-level attribution ("based on the patient's elevated cortisol") exists per commit `8634f57`. New state: structured refs that the UI can render as discoverable links.

Storage: extend `protocol_outputs` JSONB with a `source_refs` field per recommendation, or add a sibling `protocol_source_refs` table for cleaner queryability. The table approach is preferred because it lets retrieval queries efficiently answer "which protocols cited lab marker X?" or "which protocols used KB entry Y?" — both useful for the rule application engine later.

Engineering: ~5-7 days. Migration + prompt update + parsing/validation layer + smoke test against a real generation.

### Sub-system 2: rich audit/preview UI

Each recommendation in the protocol editor renders its `source_refs` as readable excerpts inline — enough that the practitioner can read the source content without clicking. For details, clicking opens a side panel or modal showing the source rendered in context:

- Lab PDFs: zoom to the relevant page, highlight the cited marker/value
- Intake answers: render in the form context they came from, with the surrounding section visible
- Intake documents: preview at the cited section with the relevant span highlighted
- KB entries: full text with provenance chain (which channel, which canvas, which book, which leader)

This is the engineering-heavy piece. Page-anchored PDF rendering is non-trivial — likely PDF.js with custom annotation overlay. Intake answers need addressable URLs (probably already partial). KB entry viewer page needs to surface the same `_source` JSONB and `knowledge_sources` row context that protocol citations resolve to.

Engineering: ~10-15 days, mostly the previewer infrastructure. PDF.js integration + intake answer rendering + KB entry viewer + side-panel UX in the protocol editor.

### Sub-system 3: override actions per recommendation

Three actions on every protocol recommendation:

- **Remove (for this patient).** Reason captured (free text + multi-choice common reasons). Recommendation hidden from this patient's protocol but visible in audit history.
- **Edit.** Original captured, edited version replaces it. Both versions accessible via audit history.
- **Revert.** Returns to original or prior state, with full version history.

Per-patient state. All actions logged with timestamp, practitioner ID, and reason. The reason capture is critical — it's the raw material the learning loop consumes.

Storage: new `protocol_overrides` table per tenant with `protocol_id`, `recommendation_id`, `action_type`, `original_value`, `new_value`, `reason`, `created_at`. RLS-isolated per tenant.

Engineering: ~3-5 days. Schema + API endpoints + UI controls on each recommendation + history viewer.

---

## Part III — The learning loop (protocol side)

This is what makes Layer D durable. Without learning, every override is per-patient and dies with that patient. With learning, every override has the potential to become reusable.

### Sub-system 4: conversational rule capture

The LLM observes override actions as they happen. At logical moments — after N similar overrides in a session, at session end, on contextual cues — it prompts the practitioner with a modal:

> "I noticed you removed magnesium from the Foundation phase for the last 3 patients. Should I stop suggesting it for some group, or are these one-offs?"

The practitioner answers via a structured-but-flexible UI: a primary multi-choice ("Stop for a cohort" / "Modify the recommendation" / "These were one-offs") with free-text fallback, then drilldown widgets for cohort definition and rule action.

The cohort definition vocabulary is grounded in patient attributes: demographics (age range, gender, life stage), conditions (presented in intake), lab patterns (cortisol > X, fasting glucose > Y, ratio between two markers), intake answers (specific question + answer pattern), previous protocol patterns (anyone who's been on this for > 60 days), or free-text shorthand the LLM interprets ("patients with HPA dysfunction who are sleep-deprived").

Rule action vocabulary: replace recommendation X with recommendation Y, suppress recommendation X entirely, change dosing on recommendation X, change phase placement, add explanatory note, escalate to manual review.

Confirmation flow before any rule persists. The practitioner sees a plain-language summary: "For women over 50 with elevated AM cortisol AND poor sleep, skip magnesium glycinate in Foundation phase; use magnesium L-threonate at bedtime instead. Apply to new protocols going forward; don't change existing patients' protocols."

If they confirm, the rule persists. If they decline ("no, those were case-specific"), the system logs the negative signal so it doesn't surface the same pattern again soon.

Engineering: ~12-20 days. The LLM observation layer (subscribing to override events, recognizing patterns), the conversation flow design, the cohort definition UI, the rule compilation logic (natural-language description → structured rule). The Claude-skills creation pattern is a good prior here; the cohort and action definition phases are analogous to the parameter elicitation steps in skill authoring.

### Sub-system 5: rule storage + application engine

New `practitioner_rules` table (per-tenant, RLS-isolated):

- `rule_id`, `practitioner_id` (FK), `tenant_id`
- `rule_type` (suppress, substitute, modify_dosing, change_phase, add_note, etc.)
- `cohort_definition` JSONB (structured representation of which patients this matches)
- `action_definition` JSONB (structured representation of what to do)
- `natural_language_description` (the plain-text summary the practitioner confirmed)
- `created_at`, `created_via` (override_pattern, manual_settings, imported), `created_from_override_ids` (array of override IDs that spawned this rule)
- `status` (active, paused, superseded), `superseded_by` (FK to a newer rule), `usage_count`, `last_applied_at`

At protocol generation time, the rule application engine:

1. Queries active rules for this practitioner
2. For each rule, evaluates whether the cohort_definition matches the current patient
3. Applies matching rules — either as prompt-context augmentation (telling the model "this practitioner usually does X for patients like this") or as post-generation modification (suppress / substitute / dose-modify the model's output)
4. Records which rules applied in protocol provenance (extends sub-system 1's source_refs to include rule_ids)

Conflict detection: if two rules match the same patient and propose contradictory actions, surface back to the practitioner via the same conversational pattern. Don't silently default to either.

Engineering: ~7-12 days. Schema + matching engine + application path + conflict detection.

### Sub-system 6: settings panel for rule management

A practitioner-facing UI at `/dashboard/settings/rules` (or similar) showing:

- All active rules, sortable/filterable
- Per-rule detail: cohort definition rendered in plain language, action, audit history (which overrides spawned it, which patients it's applied to, current usage count)
- Edit, pause, delete actions with confirmation and audit logging
- Search by cohort attribute, action type, age of rule

Without this surface, rules become opaque even to the practitioner who created them. The settings panel is what keeps the system transparent rather than mysterious.

Engineering: ~5-7 days. List view + detail view + edit/pause/delete actions + search/filter.

---

## Part IV — Multi-source patient data ingestion

The MVP build order in CLAUDE.md describes patient data flow as: "Lab upload — practitioner uploads PDF lab results. AI extracts and structures the data." That's manual-upload-first. For the target user — a solo functional health practitioner with 5-15 active clients — manual upload is friction that competes against their existing data substrate. Lab results already arrive in their email (from Rupa Health, LabCorp, Quest). Patient documents already live in their Google Drive folders. Re-uploading the same files into Clinical Signal is busywork that the system should eliminate.

This sub-system replaces the manual-upload-first flow with a sources-first flow, while keeping manual upload as a guaranteed fallback for first-time setup, gaps in source coverage, and edge cases.

### Why source integration over manual upload

A functional health practitioner with 10 active clients receives lab PDFs, supplement order receipts, and prior chart records continuously across email and cloud drives. Asking them to manually upload each into Clinical Signal — for every patient, before every protocol generation — adds friction at the highest-cost moment in their workflow. Source integration removes that friction by treating Clinical Signal as a layer on top of where their data already lives, not a separate silo they have to feed.

It also strengthens the moat. The longer a practitioner uses Clinical Signal, the better the system gets at predicting which file in their Drive belongs to which patient, which email patterns indicate lab results, which sources to trust by default and which to weight lower. That accumulated state is per-practitioner; a competitor starting from scratch has zero context.

### Source priority for the target user

Functional health practitioners typically don't use the big EHR systems (Epic, Cerner). They use lighter tools, and a lot of their substrate is just cloud storage and email. The integration priority order:

| Phase | Source | Why |
|---|---|---|
| MVP / Phase 1.5 | Google Drive | Most common substrate for solo practices; auth patterns already established for KO work |
| MVP / Phase 1.5 | Gmail (and generic IMAP later) | Where Rupa, LabCorp, Quest results arrive |
| Phase 2 | Rupa Health direct API | Dominant lab platform for this segment; bypasses email for ordered labs |
| Phase 2 | Practice Better / Healthie / ChARM | Functional-health-specific practice management; not all practitioners use these but many do |
| Phase 3+ | Larger EHRs (Practice Fusion, athenahealth, etc.) | Lower priority for target user; address as the user base expands |
| Phase 3+ | FullScript | Less for data ingestion, more for outbound protocol delivery |
| Always | Manual upload | Fallback for everything else and first-month onboarding |

### The matching algorithm

Given a patient (with name, DOB, intake answers) and a pool of files/data from connected sources, the matching algorithm produces a ranked candidate set with confidence scores. Initial implementation can be rule-based with confidence multipliers; the LLM gets involved only for ambiguous cases and the conversational layer.

Signal types and their weights:

- **Strong signals (high confidence):** filename contains patient name; filename contains patient DOB; document content (OCR-parsed) contains both name and DOB; email from a known lab platform AND subject mentions patient; file lives in a folder explicitly tagged as this patient's
- **Medium signals:** document content mentions patient name only; document is in a folder the practitioner has previously associated with this patient; document date proximity to known intake/visit date; email from known lab platform without patient mention but date-proximate
- **Weak signals:** date proximity alone; folder activity in patient's name-likelihood region; email from unknown sender on lab-like subject patterns
- **Learned signals (over time):** practitioner's specific filing conventions (e.g., "this practitioner stores GI MAP results in `/labs/gut/{date}_{patient_initials}.pdf`"); per-source confidence weights (e.g., "trust Rupa subjects with high weight; trust generic LabCorp emails with low weight"); cohort-level patterns ("for patients with GI symptoms, always look in the gut-test-results folder")

The output is a ranked list. The UI surfaces:

- **Auto-included** files (high-confidence matches, above a per-practitioner-tunable threshold)
- **Suggested** files (medium-confidence matches, displayed for review)
- **Considered but excluded** files (medium-low confidence matches, available for explicit inclusion via the UI; transparent so the practitioner can see what was looked at)
- **Available across all sources** (low-confidence + everything else, surfaced via search-and-add)

### The same conversational pattern, applied to data sources

When the practitioner adds a file the system didn't suggest, or removes one it did, the system observes. At logical moments it asks:

> "You added `2026-02-15_lab_results.pdf` to Sarah's protocol, which I had ranked as low-confidence because the filename didn't contain her name. Should I look in `/labs/2026/` for her future protocols too?"

Multi-choice + free-text response. Cohort/source-definition widget. Confirmation. Rule persists as a source-learning entry.

Over time the system learns:

- Which folders in Drive correspond to which patient (explicit association)
- Which email patterns are lab results (Rupa subject patterns, LabCorp sender, etc.)
- Per-source confidence calibration (this practitioner's Drive has high signal; their Gmail attachments are noisier; their Practice Better integration is authoritative for clinical notes but not labs)
- Which patient archetypes have specific data patterns ("women over 50 with hormone symptoms always have a hormone panel from Dutch — look there first")

### Schema sketch for data sources

`practitioner_data_sources` (per-tenant): which integrations are connected, with what credentials and scope. Fields include `source_type` (google_drive, gmail, rupa_health, etc.), `connection_status`, `auth_metadata` (encrypted), `scope_descriptor` (which folders / which inbox labels / etc.), `last_synced_at`, `learned_confidence` (per-source default weight tunable over time).

`patient_data_links`: which specific files/data are linked to which patient, with confidence, source, and status. Fields include `patient_id`, `source_id` (FK to practitioner_data_sources), `external_id` (the file/email ID in the source system), `confidence_score`, `link_status` (auto_included, manually_added, manually_excluded, system_excluded), `matched_via` (signal description: "filename:name+dob", "folder:practitioner_tagged", etc.), `created_at`, `created_by` (system or practitioner).

`data_source_rules` (parallel to `practitioner_rules` from sub-system 5, but scoped to data matching): learned matching rules — e.g., "files in `/labs/gut/` belong to patient if practitioner_tagged_patient_id matches" or "Rupa emails with subject containing patient last name auto-include." Fields: `rule_id`, `cohort_definition` (when this rule applies), `match_definition` (the matching logic), `confidence_floor` (threshold for auto-include vs. suggest), audit fields.

### What the practitioner sees in the workflow

When the practitioner clicks "Generate Protocol" on a patient:

1. System pre-runs the matching algorithm
2. UI shows: "I found these documents for [Patient Name]" with three sections — Auto-included (confident), Suggested (review these), and Considered (lower confidence, available for explicit inclusion)
3. Practitioner reviews; adds/removes via single click; conversational prompt fires for any non-obvious add/remove
4. Once practitioner affirms or edits the set, protocol generation runs against that final corpus
5. Protocol outputs cite which documents/values were actually used (this is sub-system 1's structured provenance — closes the loop)

This is materially better than upload-everything-then-generate. The practitioner spends 30 seconds reviewing a curated set instead of digging through files. The system learns what they actually consider relevant. Manual upload becomes a button next to the candidate list, used when something's missing.

### Engineering size

- Source connector infrastructure (auth, scoping, syncing for Google Drive + Gmail as initial sources): ~10-15 days
- Matching algorithm (rule-based with confidence scoring, OCR pass on filenames and lightweight content matching): ~7-10 days
- UI surface (candidate review, add/remove, search-and-add): ~7-10 days
- Conversational learning loop reuse (shares infrastructure with sub-systems 4-6): ~3-5 days incremental for data-source learning rules

Total: ~27-40 days for the data-source ingestion sub-system alone, with shared infrastructure leverage from the protocol-side learning loop.

---

## Part V — Schema sketches consolidated

Five new tables, all per-tenant with RLS:

1. **`protocol_source_refs`** — every protocol recommendation's structured refs (sub-system 1). Fields: `recommendation_id` (FK), `ref_type` (lab, intake, kb, rule), `ref_target_id`, `ref_metadata` (JSONB: marker name + value + page anchor, etc.).

2. **`protocol_overrides`** — every override action (sub-system 3). Fields: `protocol_id`, `recommendation_id`, `action_type`, `original_value` (JSONB), `new_value` (JSONB), `reason`, `reason_category`, `created_at`, `created_by`.

3. **`practitioner_rules`** — learned clinical rules (sub-system 5). Fields as described above.

4. **`practitioner_data_sources`** — connected integrations (Part IV).

5. **`patient_data_links`** — file-to-patient associations with confidence (Part IV).

Plus extension to existing tables:

- `protocol_outputs.source_refs` JSONB — top-level summary of which inputs informed which top-level outputs (cached from `protocol_source_refs` for query speed)
- `audit_log` extension to capture override actions and rule applications

---

## Part VI — The conversational pattern in detail

Both learning loops share the same conversational substrate. Three design principles:

### Observe more than you interrupt

The system should accumulate observations for some time before surfacing a question. Asking after every override is annoying; asking after a clear pattern emerges is helpful. Trigger conditions: N similar overrides in a session, N overrides of the same type across patients, end-of-session retrospective ("you made these 4 changes today — any of them worth keeping?"), or contextual cues ("you started overriding cortisol-related recommendations after viewing this lab — does that lab type usually need different handling?").

Per-practitioner sensitivity tuning: a new practitioner may want more prompts (system asks "should this be a rule?" after every distinctive override); an experienced practitioner may want fewer (system only surfaces high-confidence patterns).

### Structured-but-flexible widgets

For each captured rule, present a primary multi-choice question with 3-5 options plus free-text "other." Then drilldown to define the cohort and the action via widget plus free-text fallback. The Claude-skills creation pattern is the design prior: capture intent fast, then refine.

Cohort definition uses controlled vocabulary where possible. Suggest cohort attributes that align with the overrides observed ("you've done this 3 times — these were all women over 50; should the rule apply to that group?"). Free-text shorthand ("HPA-dysfunctional sleep-deprived patients") gets LLM-interpreted into structured form, with the practitioner confirming the interpretation before persisting.

### Confirmation flow with plain-language summary

Before any rule persists, the practitioner sees a plain-language summary of what they're agreeing to: "For women over 50 with elevated AM cortisol AND poor sleep, skip magnesium glycinate; use magnesium L-threonate at bedtime instead. Apply to new protocols only — don't change existing patients." Then a clear confirm/cancel. The plain-language summary doubles as the natural-language description stored on the rule for later auditing.

---

## Part VII — Compliance and audit considerations

The override and rule layer touches PHI in multiple ways:

- Override actions reference specific patient recommendations — patient ID and clinical content are involved
- Rules define cohorts that may use patient attributes (age, gender, conditions) — these definitions must not expose individual patient data when surfaced in the rule list
- Rule applications affect protocol generation — audit must capture which rules applied and the inputs that triggered them

HIPAA implications:

- All five new tables RLS-isolated per tenant (standard pattern)
- Audit log captures: every override action, every rule application, every rule edit
- Rule definitions stored as cohort *attributes*, not as references to specific patients (so reading a rule definition doesn't expose any patient's data)
- Data-source integrations require BAA where source provider holds PHI — Google Drive (BAA available via Workspace), Gmail (BAA available), Rupa Health (BAA standard), EHR (BAA required)
- New sub-processor approvals likely needed for each integration

A specific item to call out: the data-source learning rules ("Rupa subjects with patient last name auto-include") must not themselves persist patient identifiers across patients. Source rules describe *patterns*, not specific files. The implementation must enforce this — no patient IDs in `data_source_rules` rule definitions; only patterns that match against patient context at runtime.

---

## Part VIII — Engineering size estimate and phasing

Total scope (all seven sub-systems): approximately 60-95 engineering days. 12-19 weeks calendar at solo-developer pace. This is comparable in scope to the original MVP foundation. Cannot ship in one phase.

Recommended split:

### MVP scope — protocol audit and override foundation (no learning loop yet)

- Sub-system 1 (structured source provenance) — required
- Sub-system 2 (audit/preview UI) — required
- Sub-system 3 (override actions) — required
- Sub-system 7 (multi-source ingestion) — Google Drive integration + matching algorithm + UI surface for candidate review. *No learning yet on the data-source side either.*

Estimated: ~28-42 days. ~6-8 weeks.

This gives Dr. Laura everything visible at launch — she sees how recommendations are derived, can override per-patient with reasoning captured, and pulls patient data from her actual Drive instead of re-uploading everything. The system records overrides and source-match decisions but doesn't yet ask "should this be a rule?"

### Phase 1.5 — learning loops (protocol-side + data-source-side)

- Sub-system 4 (conversational rule capture)
- Sub-system 5 (rule storage + application engine)
- Sub-system 6 (settings panel)
- Data-source learning loop (the conversational layer applied to source decisions)

Estimated: ~24-40 days. ~5-8 weeks. Ship 4-8 weeks after MVP launch.

The reason for sequencing: the rule-capture conversation flow will be vastly better when it's designed against real override patterns from Dr. Laura's actual usage, not against hypotheses about how she might override. First-impressions argument cuts the other way (ship learning at launch for the strongest moat signal day-one), but the cost of a learning loop that asks bad questions is worse than the cost of waiting — it erodes practitioner trust faster than no loop at all.

### Phase 2 — expanded source integrations

- Rupa Health direct API
- Gmail / IMAP for lab result emails
- Practice Better / Healthie integrations for the practitioners who use them

Estimated: ~15-25 days per major integration. Ship as user demand emerges.

### Phase 3 — larger EHR integrations and FullScript

Defer until user base growth justifies the development and BAA work.

---

## Part IX — Open questions

These need decisions before any implementation begins:

1. **Rule application timing — prompt-context vs. post-processing.** Should rules influence the protocol generation prompt (model is told "this practitioner usually does X for patients like this") or be applied as post-generation modifications (model generates normally, then the engine substitutes/suppresses)? Prompt-context is cleaner narratively but harder to audit (the model's output is conflated with the rule's influence). Post-processing is auditable but may produce less coherent protocols.

2. **Cohort definition expressiveness.** How rich does the cohort grammar need to be at v1? Demographics + conditions + lab thresholds + intake answer patterns is probably the right floor. Complex compound conditions ("age > 50 AND cortisol AM > 25 AND ((sleep < 6h) OR (HPA dysfunction noted in intake))") are harder to surface in the UI and may require an "advanced" mode.

3. **Conflict resolution UX when two rules disagree.** Should the system show both and ask the practitioner to choose at protocol-generation time, or surface the conflict separately and ask them to resolve it once (then apply the resolution to all future matching patients)? Latter is more efficient but loses some context-specific judgment.

4. **Source-of-truth for patient identity matching.** When pulling files from multiple sources, what's the authoritative patient identifier? Patient name + DOB is the natural answer, but name spellings vary and DOB isn't always in files. Need a fuzzy-matching strategy with practitioner-confirmation fallback.

5. **LLM model choice for the conversational layer.** Claude (current model) is fine for the conversation, but cost considerations apply at scale. The conversational layer is bursty (silent most of the time, then a flurry when a pattern is identified). Reasonable to use the same model used for protocol generation, but worth noting as ongoing-cost line item.

6. **Per-practitioner sensitivity tuning UI.** Where does the practitioner control "how often should the system ask me about rules?" — a setting in the rules panel? An adjustment they set during the first few interactions? A learned per-practitioner preference?

7. **Cohort-level rule sharing across practitioners (future).** Eventually, practitioners might want to share rules with each other (or import rules from a leader they trust). Out of scope for MVP / Phase 1.5, but the schema design should not preclude it. Note in implementation that rules are scoped per-practitioner today; cross-practitioner sharing is a future workstream.

---

## Part X — Relationship to existing prioritization

This design changes the prioritization doc in three ways:

### Replaces existing Layer D plans

`docs/MVP-PRIORITIZATION-2026-05-08.md` rev 7's Layer D items D.1-D.6 (the document-upload-based Layer D) are superseded by this design. D.1 (schema migration) becomes part of Phase 1.5's rule storage. D.2 (upload endpoint) becomes part of MVP's multi-source ingestion. D.3 (extraction pipeline) becomes part of source connector infrastructure. D.4 (cross-layer retrieval) is partially covered by rule application; partially still needed for KB retrieval. D.5 (management UI) becomes Sub-system 6. D.6 (inline conflict surfacing) is replaced by Sub-system 5's conflict detection.

The document-upload version was the right idea at the wrong altitude. This design absorbs it.

### Affects KO retrieval layer

The KO retrieval logic (current C.4 in the prioritization doc) needs to participate in the new framework. When protocol generation runs, retrieval pulls KB entries; those entries become source_refs in the output. The retrieval layer also needs to be aware of practitioner rules that affect which KB content is preferred ("this practitioner has overridden hormone-related KB recommendations 5 times — weight those entries lower").

This is incremental work on top of C.4, not a rewrite. Probably +5-10 days on the existing C.4 estimate.

### Reshapes the MVP build order

The new MVP scope from Part VIII (~6-8 weeks for foundation including multi-source ingestion) is larger than the prior MVP scope assumed. The right tradeoff is: ship MVP slightly later but with the moat-defining features in place. The "ship faster but weaker" alternative would defer this to Phase 1.5 and ship MVP with manual-upload-only and no override/audit surface — which leaves Dr. Laura's first impression as "AI black box that produces protocols" instead of "system I can audit and customize." The first impression matters more than the calendar.

Net effect on the overall plan: MVP launch slides by approximately 6-8 weeks but ships with the architecture that makes Clinical Signal defensible. Phase 1.5 (learning loops) adds another 5-8 weeks. Total path to "full moat operational" is approximately 11-16 weeks from now, versus the prior estimate that assumed manual upload + no learning + Layer D deferred entirely.

---

## What this doc isn't

This is not an implementation spec. It's a strategic design that names the sub-systems, sketches the schema, identifies the cross-cutting patterns, and surfaces the open questions. Before any code is written, each sub-system needs its own implementation design (a handoff prompt level of detail) that resolves the relevant open questions from Part IX and produces a concrete migration + endpoint + UI spec.

The next planning artifacts after this doc:

1. Resolve open questions 1-7 with Ryan
2. Update `MVP-PRIORITIZATION-2026-05-08.md` to reflect the new Layer D scope and the MVP/Phase 1.5 split
3. Write a sub-system-1 (structured source provenance) implementation prompt — the natural starting point because everything else depends on it
4. Sequence the remaining sub-system handoff prompts based on dependencies

The actual building begins after those four are complete.
