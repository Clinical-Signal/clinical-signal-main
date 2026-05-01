-- 0013_clinical_dialogues.sql
-- Clinical dialogue system — active learning questions that surface
-- practitioner expertise and capture tacit clinical knowledge.
--
-- Each protocol generation produces a set of contextual questions.
-- When the practitioner answers, we store the answer alongside the
-- clinical context that triggered the question. Over time, these
-- Q&A pairs become a knowledge base of practitioner reasoning that
-- feeds back into protocol generation.

BEGIN;

-- ---------------------------------------------------------------------------
-- Clinical dialogues: the Q&A pairs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clinical_dialogues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  practitioner_id UUID NOT NULL,
  protocol_id     UUID NOT NULL REFERENCES protocols(id),
  patient_id      UUID NOT NULL,

  -- The question
  question_text   TEXT NOT NULL,
  question_type   TEXT NOT NULL CHECK (question_type IN (
    'clinical_reasoning',     -- "Why did you choose X over Y?"
    'interpretation',         -- "How do you read this lab pattern?"
    'sequencing',             -- "Would you address A before B?"
    'lifestyle_context',      -- "Does the patient's lifestyle change your approach?"
    'symptom_connection',     -- "Do you see these symptoms as connected?"
    'experience_based',       -- "In your experience with similar patients..."
    'safety_consideration',   -- "Given the medication list, would you adjust?"
    'patient_readiness'       -- "Is this patient ready for this level of change?"
  )),
  question_context JSONB NOT NULL DEFAULT '{}', -- what triggered this question
  -- e.g. { "trigger": "borderline_tsh_with_fatigue",
  --        "relevant_findings": ["TSH 2.8", "fatigue score 7/10"],
  --        "protocol_decision": "HPA axis first, defer thyroid" }

  -- The practitioner's answer
  answer_text     TEXT,           -- null if unanswered
  answer_choice   TEXT,           -- for multiple-choice questions (optional)
  answered_at     TIMESTAMPTZ,

  -- Learning metadata
  confidence      NUMERIC(3,2) DEFAULT 0.5,  -- how confident the system was in its decision
  answer_changed_protocol BOOLEAN DEFAULT false, -- did the practitioner edit the protocol based on this?
  learning_extracted BOOLEAN DEFAULT false,       -- has the learning pipeline processed this answer?
  extracted_insight TEXT,                          -- what the system learned from this answer

  -- Categorization for retrieval
  systems_involved TEXT[] DEFAULT '{}', -- e.g. ['hpa_axis', 'thyroid', 'gut']
  tags            TEXT[] DEFAULT '{}',  -- free-form tags for retrieval

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying a practitioner's dialogue history
CREATE INDEX idx_clinical_dialogues_practitioner
  ON clinical_dialogues (practitioner_id, created_at DESC);

-- Index for finding similar questions by type and systems
CREATE INDEX idx_clinical_dialogues_type_systems
  ON clinical_dialogues (question_type, systems_involved)
  WHERE answer_text IS NOT NULL;

-- Index for the learning pipeline (unprocessed answers)
CREATE INDEX idx_clinical_dialogues_unextracted
  ON clinical_dialogues (practitioner_id)
  WHERE answer_text IS NOT NULL AND learning_extracted = false;

-- Index for protocol-specific dialogues
CREATE INDEX idx_clinical_dialogues_protocol
  ON clinical_dialogues (protocol_id);

-- RLS
ALTER TABLE clinical_dialogues ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_dialogues FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON clinical_dialogues
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- Practitioner knowledge base: insights extracted from dialogues
-- ---------------------------------------------------------------------------
-- As the system processes dialogue answers, it distills them into
-- reusable knowledge entries. These are higher-level than individual
-- Q&A pairs — they represent learned patterns like:
-- "This practitioner prioritizes gut repair before hormones in
--  perimenopausal patients with GI symptoms"

CREATE TABLE IF NOT EXISTS practitioner_knowledge (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  practitioner_id UUID NOT NULL,

  -- The insight
  insight_text    TEXT NOT NULL,       -- natural language description
  category        TEXT NOT NULL CHECK (category IN (
    'clinical_reasoning',   -- how they think about clinical decisions
    'interpretation_style', -- how they read lab values / symptoms
    'sequencing_preference', -- their approach to treatment ordering
    'patient_communication', -- how they prefer to communicate
    'product_preference',    -- specific supplements / brands they prefer
    'lifestyle_emphasis',    -- what lifestyle factors they weight heavily
    'safety_threshold'       -- their personal safety thresholds
  )),

  -- Evidence
  supporting_dialogue_ids UUID[] NOT NULL, -- which Q&A pairs led to this insight
  confidence      NUMERIC(3,2) DEFAULT 0.5,
  times_confirmed INT DEFAULT 1,          -- how many times this insight has been validated

  -- Context for retrieval
  systems_involved TEXT[] DEFAULT '{}',
  conditions      TEXT[] DEFAULT '{}',    -- e.g. ['perimenopausal', 'gut_dysbiosis']
  tags            TEXT[] DEFAULT '{}',

  -- Lifecycle
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_practitioner_knowledge_lookup
  ON practitioner_knowledge (practitioner_id, category, active)
  WHERE active = true;

CREATE INDEX idx_practitioner_knowledge_systems
  ON practitioner_knowledge USING GIN (systems_involved)
  WHERE active = true;

ALTER TABLE practitioner_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE practitioner_knowledge FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON practitioner_knowledge
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

COMMIT;
