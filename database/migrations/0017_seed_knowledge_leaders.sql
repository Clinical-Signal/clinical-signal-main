-- 0017_seed_knowledge_leaders.sql
--
-- Step 0 of the Knowledge Orchestrator foundation work (per
-- docs/MVP-PRIORITIZATION-2026-05-08.md Layer C and
-- docs/KO-EXTRACTION-AND-CONFLICT-INVESTIGATION.md).
--
-- Three things, all idempotent (safe to re-run):
--   1. Seed knowledge_domains with the 6 functional-health domains the
--      catalog implies (gut, hormones, sleep, metabolism, nervous system,
--      foundational). Used as reference data for tagging.
--   2. Seed knowledge_leaders with the 7 trusted-leader entries from
--      docs/knowledge-orchestrator/trusted-leaders-content-catalog.md.
--   3. Backfill leader_id on the existing 1,217 clinical_knowledge rows
--      from the Slack ingestion — they're all Dr. Laura's voice.
--
-- All inserts iterate over the tenants table so this works for the dev
-- tenant and any production tenant equivalently. ON CONFLICT clauses make
-- this safe to run multiple times.

-- ============================================================
-- 1. Seed knowledge_domains
-- ============================================================
-- The 6 high-level functional-health domains. Add more as the catalog
-- grows. `slug` is what code references; `name` is human-readable.

INSERT INTO knowledge_domains (tenant_id, slug, name, description, sort_order)
SELECT t.id, d.slug, d.name, d.description, d.sort_order
FROM tenants t
CROSS JOIN (VALUES
  ('gut_health',      'Gut Health',                'Digestion, microbiome, SIBO, dysbiosis, gut-brain axis, food sensitivities, intestinal permeability.', 1),
  ('hormones',        'Hormones',                  'Sex hormones, thyroid, adrenal, HPA axis, perimenopause / menopause, cycle, fertility, hormone-gut connection.', 2),
  ('sleep',           'Sleep & Circadian',         'Sleep architecture, circadian rhythm, HRV, recovery, melatonin, light exposure, wearable-tracked patterns.', 3),
  ('metabolism',      'Metabolism & Blood Sugar',  'Insulin sensitivity, glucose regulation, weight, body composition, mitochondrial function, fasting.', 4),
  ('nervous_system',  'Nervous System & Stress',   'Stress physiology, vagal tone, nervous system regulation, anxiety, mood, neuroinflammation.', 5),
  ('foundational',    'Foundational Health',       'Cross-cutting basics: nutrition, movement, mindset, lifestyle. The substrate everything else sits on.', 6)
) AS d(slug, name, description, sort_order)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- ============================================================
-- 2. Seed knowledge_leaders
-- ============================================================
-- One row per trusted leader, scoped per tenant. `is_internal=true` flags
-- Dr. Laura as the practitioner-of-record / tiebreaker authority.

INSERT INTO knowledge_leaders (
  tenant_id, name, slug, credentials, specialties, authority_domains,
  website_url, notes, is_internal, active
)
SELECT
  t.id, l.name, l.slug, l.credentials, l.specialties, l.authority_domains,
  l.website_url, l.notes, l.is_internal, l.active
FROM tenants t
CROSS JOIN (VALUES
  -- Dr. Laura first — the practitioner-of-record, ground-truth tiebreaker.
  (
    'Dr. Laura',
    'dr-laura',
    'IFMCP',
    ARRAY['functional_medicine','clinical_sequencing','patient_communication','protocol_design']::TEXT[],
    ARRAY['gut_health','hormones','sleep','metabolism','nervous_system','foundational']::TEXT[],
    NULL,
    'Internal practitioner voice. Trains 35+ practitioners. When external leaders disagree, her clinical judgment is the tiebreaker for Clinical Signal protocols. All existing 1,217 Slack-sourced entries are her voice (backfilled below).',
    TRUE,
    TRUE
  ),
  (
    'Andrew Huberman',
    'andrew-huberman',
    'PhD, Stanford School of Medicine',
    ARRAY['neuroscience','neuroplasticity','sleep','focus','stress','hormones','performance']::TEXT[],
    ARRAY['sleep','nervous_system']::TEXT[],
    'https://hubermanlab.com',
    'Massive content library (~200 podcast eps, 7.4M YouTube subs). Long-form deep dives + toolkit summaries. Transcripts may be accessible via Dexa AI.',
    FALSE,
    TRUE
  ),
  (
    'Dr. Rhonda Patrick',
    'rhonda-patrick',
    'PhD',
    ARRAY['nutrition','longevity','nutrigenomics','sauna','fasting','micronutrients','metabolic_health','aging']::TEXT[],
    ARRAY['foundational','metabolism']::TEXT[],
    'https://foundmyfitness.com',
    'Most research-citation-heavy of all leaders. Nutrigenomics expertise unique among the set. Premium "Aliquot" podcast (200+ eps) is members-only.',
    FALSE,
    TRUE
  ),
  (
    'Dr. Sara Gottfried',
    'sara-gottfried',
    'MD, Harvard',
    ARRAY['hormones','womens_health','menopause','metabolic_health','precision_medicine','brain_health','autoimmune']::TEXT[],
    ARRAY['hormones']::TEXT[],
    'https://saraszalmd.com',
    'Also publishes as Dr. Sarah Szal. THE primary hormone authority in the leader set. 4 NYT bestsellers. The Gottfried Protocol (from The Hormone Cure) is a structured clinical framework that maps directly to protocol generation.',
    FALSE,
    TRUE
  ),
  (
    'Dr. Will Cole',
    'will-cole',
    'IFMCP, DNM, DC',
    ARRAY['functional_medicine','gut_health','inflammation','autoimmune','hormonal_imbalance','thyroid','brain_health','nutrition']::TEXT[],
    ARRAY['gut_health']::TEXT[],
    'https://drwillcole.com',
    'Books map cleanly to specific domains: Gut Feelings → gut, The Inflammation Spectrum → autoimmune, Ketotarian + Intuitive Fasting → nutrition. Telehealth practice gives content a clinical/practical skew.',
    FALSE,
    TRUE
  ),
  (
    'Dr. Mark Hyman',
    'mark-hyman',
    'MD, Cleveland Clinic, IFM Board Member',
    ARRAY['functional_medicine','metabolic_health','nutrition','longevity','chronic_disease','gut_health','blood_sugar']::TEXT[],
    ARRAY['foundational','metabolism','gut_health']::TEXT[],
    'https://drhyman.com',
    'Highest content volume — 16+ books, 300M+ podcast downloads. Institutional credibility (Cleveland Clinic, IFM, Function Health). Will need to prioritize ingestion by domain rather than ingest everything.',
    FALSE,
    TRUE
  ),
  (
    'Dr. Kristen Holmes',
    'kristen-holmes',
    'PhD Psychology, MIT Sloan AI Cert',
    ARRAY['sleep','hrv','recovery','circadian','stress_physiology','performance_science','training_load']::TEXT[],
    ARRAY['sleep']::TEXT[],
    NULL,
    'Global Head of Human Performance at WHOOP. Smaller content volume but extremely high signal-to-noise for sleep / recovery / HRV. Primary sources: Aligned book + podcasts + research papers.',
    FALSE,
    TRUE
  )
) AS l(
  name, slug, credentials, specialties, authority_domains,
  website_url, notes, is_internal, active
)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- ============================================================
-- 3. Backfill leader_id on existing clinical_knowledge entries
-- ============================================================
-- Every existing row in clinical_knowledge with a non-null source_channel
-- came from the Slack ingestion (the only ingestion path that's run so
-- far). All Slack content is Dr. Laura's voice — she's the sole
-- practitioner whose Slack data was extracted. Tag them all to her
-- leader_id, scoped per tenant so RLS / tenant isolation holds.

UPDATE clinical_knowledge ck
SET leader_id = l.id
FROM knowledge_leaders l
WHERE l.slug = 'dr-laura'
  AND l.tenant_id = ck.tenant_id
  AND ck.leader_id IS NULL
  AND ck.source_channel IS NOT NULL;

-- ============================================================
-- 4. Verification (uncomment to inspect after applying)
-- ============================================================
-- SELECT 'domains seeded' AS check, COUNT(*) AS n FROM knowledge_domains;
-- SELECT 'leaders seeded' AS check, COUNT(*) AS n FROM knowledge_leaders;
-- SELECT 'entries with leader_id' AS check, COUNT(*) AS n
--   FROM clinical_knowledge WHERE leader_id IS NOT NULL;
-- SELECT 'entries still null leader_id' AS check, COUNT(*) AS n
--   FROM clinical_knowledge WHERE leader_id IS NULL;
