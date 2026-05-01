/**
 * Clinical dialogue system — active learning through contextual questions.
 *
 * After generating a protocol, the system asks 3-5 smart questions that:
 *   1. Surface practitioner expertise that can't be captured in preferences
 *   2. Force the practitioner to think about nuances the AI might miss
 *   3. Capture answers as structured knowledge for future protocols
 *   4. Position Clinical Signal as a clinical thinking partner, not just a tool
 *
 * Question categories:
 *   - clinical_reasoning: "Why X over Y?" — captures decision frameworks
 *   - interpretation: "How do you read this pattern?" — captures lab literacy
 *   - sequencing: "A before B?" — captures treatment ordering preferences
 *   - lifestyle_context: "Does the patient's lifestyle change your approach?"
 *   - symptom_connection: "Do you see these symptoms as connected?"
 *   - experience_based: "In your experience with similar patients..."
 *   - safety_consideration: "Given the medication list, would you adjust?"
 *   - patient_readiness: "Is this patient ready for this level of change?"
 */

import { withTenant } from "./db";

const DIALOGUE_MODEL = "claude-sonnet-4-5-20250929";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuestionType =
  | "clinical_reasoning"
  | "interpretation"
  | "sequencing"
  | "lifestyle_context"
  | "symptom_connection"
  | "experience_based"
  | "safety_consideration"
  | "patient_readiness";

export interface ClinicalQuestion {
  questionText: string;
  questionType: QuestionType;
  context: Record<string, unknown>;
  systemsInvolved: string[];
  confidenceInCurrentApproach: number;
}

export interface DialogueEntry {
  id: string;
  questionText: string;
  questionType: QuestionType;
  context: Record<string, unknown>;
  answerText: string | null;
  answeredAt: Date | null;
  systemsInvolved: string[];
}

// ---------------------------------------------------------------------------
// Question generation prompt
// ---------------------------------------------------------------------------

const QUESTION_GENERATION_PROMPT = `You are a clinical thinking partner for a functional medicine practitioner. You have just generated a protocol for their patient. Your job is to ask 3-5 thoughtful questions that accomplish two things:

1. **Draw out the practitioner's expertise** — the nuances they've learned from years of clinical experience that no AI can know upfront. Things like "patients with this presentation who also have mold exposure tend to respond differently" or "I've learned to check X before recommending Y in this demographic."

2. **Help the practitioner think more deeply** — not in a quizzy way, but as a colleague who's genuinely curious about their clinical reasoning. A good question makes them think "that's a good point, let me consider that."

## What makes a great clinical dialogue question

GREAT questions are:
- Specific to THIS patient's data (not generic)
- Rooted in genuine uncertainty or ambiguity in the data
- Asking about the *connection* between things, not individual facts
- Phrased as a colleague would ask, not as a test
- Short enough to answer in 1-3 sentences

GREAT example: "The cortisol pattern suggests HPA dysregulation, but the patient also mentioned they recently started a high-intensity exercise program. In your experience, do you want to address the exercise piece as part of the adrenal protocol, or would you treat them independently?"

TERRIBLE questions are:
- Generic ("What are your thoughts on the protocol?")
- Testing knowledge ("What is the mechanism of action of berberine?")
- Obvious from the data ("Is the patient's TSH elevated?")
- Too broad ("How would you approach this patient?")
- About formatting/structure ("Would you prefer 3 or 4 phases?")

## Question types to cover

Try to include a mix:
- **clinical_reasoning**: Ask about a specific decision in the protocol. "I went with X approach because of Y — does that match your read, or do you see something I'm missing?"
- **interpretation**: Ask about a lab value or symptom pattern where reasonable practitioners might disagree. "The ferritin is 35 — technically in range but low for someone with fatigue and hair loss. How aggressively would you address iron here?"
- **sequencing**: Ask about treatment ordering. "I put gut repair in Layer 1 and hormone support in Layer 3 — but the patient's chief complaint is hormonal. Would you move hormone work earlier to address their primary concern sooner?"
- **lifestyle_context**: Ask about how the patient's lifestyle should influence the protocol. "The patient works night shifts. Does that change how you'd approach the cortisol protocol?"
- **symptom_connection**: Ask about patterns across body systems. "I noticed the patient has both joint pain and brain fog. Are you thinking inflammation is the connecting thread, or do you see a different root cause?"
- **experience_based**: Ask about something you can't find in textbooks. "In your experience, when patients present with this combination of GI symptoms and anxiety, do you find addressing the gut resolves the anxiety, or do you typically need to work both in parallel?"
- **patient_readiness**: Ask about the patient's capacity for change. "This protocol has 8 new supplements plus significant dietary changes. Given what you know about this patient, is that realistic for Layer 1, or would you pare it down?"

## Output contract

Return ONLY valid JSON with this shape:

{
  "questions": [
    {
      "question_text": "string — the question, written as a colleague would ask",
      "question_type": "clinical_reasoning | interpretation | sequencing | lifestyle_context | symptom_connection | experience_based | safety_consideration | patient_readiness",
      "context": {
        "trigger": "string — what in the data triggered this question",
        "relevant_findings": ["string — specific data points relevant to the question"],
        "protocol_decision": "string — what the protocol currently does re: this question"
      },
      "systems_involved": ["string — body systems relevant to this question"],
      "confidence_in_current_approach": "number 0-1 — how confident you are that the protocol's current approach is right. Lower = more important to ask"
    }
  ]
}

## Rules
- Ask 3-5 questions, prioritized by importance (lowest confidence first)
- Never ask about things the practitioner has already stated preferences for
- Never ask questions where the answer is obvious from the data
- Frame questions with curiosity and respect, not doubt
- Reference specific data points from the analysis — show you've read the chart
- If the data is sparse, ask about the gaps — "I didn't see thyroid labs. Would you want those before starting this protocol, or are you comfortable proceeding based on symptoms?"
- This is how Clinical Signal earns trust: by thinking like a clinician, not a form`;

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

/**
 * Generate contextual clinical questions for a protocol.
 * Called after protocol generation, before the practitioner reviews.
 */
export async function generateClinicalQuestions(
  findings: Record<string, unknown>,
  protocol: Record<string, unknown>,
  practitionerKnowledge?: string,
): Promise<ClinicalQuestion[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const claude = new Anthropic({ apiKey: key, timeout: 60_000 });

  // Build a focused context — don't send entire protocol, just the relevant parts
  const analysisContext = {
    summary: findings.summary,
    clinical_picture: findings.clinical_picture,
    systems_analysis: findings.systems_analysis,
    key_lab_findings: findings.key_lab_findings,
    current_medications: findings.current_medications,
    safety_considerations: findings.safety_considerations,
    root_cause_hypotheses: findings.root_cause_hypotheses,
    clinical_sequencing: findings.clinical_sequencing,
    uncertainty: findings.uncertainty,
    data_gaps: findings.data_gaps,
  };

  const clinicalProtocol = protocol.clinical_protocol as Record<string, unknown> | undefined;
  const protocolContext = {
    title: protocol.title,
    summary_of_findings: clinicalProtocol?.summary_of_findings,
    systems_analysis: clinicalProtocol?.systems_analysis,
    supplement_protocol: clinicalProtocol?.supplement_protocol,
    dietary_recommendations: clinicalProtocol?.dietary_recommendations,
    lifestyle_recommendations: clinicalProtocol?.lifestyle_recommendations,
    clinical_reasoning: clinicalProtocol?.clinical_reasoning,
    safety_review: clinicalProtocol?.safety_review,
  };

  let userContent =
    "Generate clinical dialogue questions for this protocol. The analysis and protocol are below.\n\n" +
    "<analysis>\n" + JSON.stringify(analysisContext, null, 2) + "\n</analysis>\n\n" +
    "<protocol>\n" + JSON.stringify(protocolContext, null, 2) + "\n</protocol>";

  if (practitionerKnowledge) {
    userContent += "\n\n<practitioner_context>\n" +
      "The practitioner has previously shared the following insights. " +
      "Do NOT ask questions that are already answered by this knowledge.\n" +
      practitionerKnowledge +
      "\n</practitioner_context>";
  }

  console.log("[clinical-dialogue] Generating questions");
  const t0 = Date.now();

  const response = await claude.messages.create({
    model: DIALOGUE_MODEL,
    max_tokens: 3000,
    system: QUESTION_GENERATION_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("[clinical-dialogue] Questions generated in", elapsed + "s");

  let raw = "";
  for (const block of response.content) {
    if (block.type === "text") raw += block.text;
  }

  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\n/, "");
    cleaned = cleaned.replace(/\n```\s*$/, "");
  }

  const parsed = JSON.parse(cleaned) as {
    questions: Array<{
      question_text: string;
      question_type: QuestionType;
      context: Record<string, unknown>;
      systems_involved: string[];
      confidence_in_current_approach: number;
    }>;
  };

  return (parsed.questions ?? []).map((q) => ({
    questionText: q.question_text,
    questionType: q.question_type,
    context: q.context ?? {},
    systemsInvolved: q.systems_involved ?? [],
    confidenceInCurrentApproach: q.confidence_in_current_approach ?? 0.5,
  }));
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

/**
 * Store generated questions for a protocol. Called after protocol generation.
 */
export async function storeDialogueQuestions(
  tenantId: string,
  practitionerId: string,
  protocolId: string,
  patientId: string,
  questions: ClinicalQuestion[],
): Promise<string[]> {
  if (questions.length === 0) return [];

  return withTenant(tenantId, async (c) => {
    const ids: string[] = [];
    for (const q of questions) {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO clinical_dialogues
           (tenant_id, practitioner_id, protocol_id, patient_id,
            question_text, question_type, question_context,
            confidence, systems_involved)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
         RETURNING id`,
        [
          tenantId,
          practitionerId,
          protocolId,
          patientId,
          q.questionText,
          q.questionType,
          JSON.stringify(q.context),
          q.confidenceInCurrentApproach,
          q.systemsInvolved,
        ],
      );
      ids.push(rows[0]!.id);
    }
    console.log(`[clinical-dialogue] Stored ${ids.length} questions for protocol ${protocolId}`);
    return ids;
  });
}

/**
 * Get dialogue questions for a protocol (for the editor UI).
 */
export async function getDialogueForProtocol(
  tenantId: string,
  protocolId: string,
): Promise<DialogueEntry[]> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      question_text: string;
      question_type: QuestionType;
      question_context: Record<string, unknown>;
      answer_text: string | null;
      answered_at: Date | null;
      systems_involved: string[];
    }>(
      `SELECT id, question_text, question_type, question_context,
              answer_text, answered_at, systems_involved
         FROM clinical_dialogues
        WHERE protocol_id = $1
        ORDER BY confidence ASC, created_at ASC`,
      [protocolId],
    );
    return rows.map((r) => ({
      id: r.id,
      questionText: r.question_text,
      questionType: r.question_type,
      context: r.question_context,
      answerText: r.answer_text,
      answeredAt: r.answered_at,
      systemsInvolved: r.systems_involved,
    }));
  });
}

/**
 * Record a practitioner's answer to a clinical dialogue question.
 */
export async function answerDialogueQuestion(
  tenantId: string,
  dialogueId: string,
  answerText: string,
): Promise<void> {
  await withTenant(tenantId, async (c) => {
    await c.query(
      `UPDATE clinical_dialogues
         SET answer_text = $1, answered_at = now()
       WHERE id = $2`,
      [answerText.trim(), dialogueId],
    );
  });
  console.log("[clinical-dialogue] Answer recorded for question", dialogueId);
}

// ---------------------------------------------------------------------------
// Knowledge retrieval — get practitioner's past insights for context
// ---------------------------------------------------------------------------

/**
 * Get practitioner knowledge relevant to specific body systems.
 * Used to inject into question generation and protocol generation prompts.
 */
export async function getRelevantKnowledge(
  tenantId: string,
  practitionerId: string,
  systems: string[],
): Promise<string> {
  if (systems.length === 0) return "";

  return withTenant(tenantId, async (c) => {
    // Find knowledge entries that overlap with the given systems
    const { rows } = await c.query<{
      insight_text: string;
      category: string;
      confidence: number;
      times_confirmed: number;
    }>(
      `SELECT insight_text, category, confidence, times_confirmed
         FROM practitioner_knowledge
        WHERE practitioner_id = $1
          AND active = true
          AND systems_involved && $2
        ORDER BY confidence DESC, times_confirmed DESC
        LIMIT 15`,
      [practitionerId, systems],
    );

    if (rows.length === 0) return "";

    const lines = [
      "## Practitioner clinical knowledge (learned from past dialogues)",
      "",
      "These insights reflect this practitioner's experience and clinical reasoning,",
      "captured through previous clinical dialogue questions. Use them to inform",
      "protocol decisions and avoid asking questions that are already answered.",
      "",
    ];

    for (const r of rows) {
      lines.push(`- [${r.category}] ${r.insight_text} (confidence: ${r.confidence}, confirmed ${r.times_confirmed}x)`);
    }

    return lines.join("\n");
  });
}

// ---------------------------------------------------------------------------
// Knowledge extraction — process answered dialogues into insights
// ---------------------------------------------------------------------------

const KNOWLEDGE_EXTRACTION_PROMPT = `You are analyzing a practitioner's answers to clinical dialogue questions. Your job is to extract reusable clinical insights — things the practitioner has revealed about how they think, what they prioritize, and how they approach treatment decisions.

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

If no meaningful insights can be extracted, return { "insights": [] }.`;

/**
 * Process recently answered dialogue questions and extract reusable knowledge.
 * Called periodically or after a practitioner answers questions.
 */
export async function extractKnowledge(
  tenantId: string,
  practitionerId: string,
): Promise<number> {
  // Get unprocessed answered dialogues
  const dialogues = await withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      question_text: string;
      question_type: string;
      question_context: Record<string, unknown>;
      answer_text: string;
      systems_involved: string[];
    }>(
      `SELECT id, question_text, question_type, question_context,
              answer_text, systems_involved
         FROM clinical_dialogues
        WHERE practitioner_id = $1
          AND answer_text IS NOT NULL
          AND learning_extracted = false
        ORDER BY created_at
        LIMIT 20`,
      [practitionerId],
    );
    return rows;
  });

  if (dialogues.length === 0) return 0;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const claude = new Anthropic({ apiKey, timeout: 60_000 });

  const userContent =
    "Extract clinical insights from these practitioner Q&A pairs:\n\n" +
    JSON.stringify(
      dialogues.map((d) => ({
        question: d.question_text,
        type: d.question_type,
        context: d.question_context,
        answer: d.answer_text,
        systems: d.systems_involved,
      })),
      null,
      2,
    );

  console.log("[clinical-dialogue] Extracting knowledge from", dialogues.length, "answered questions");

  const response = await claude.messages.create({
    model: DIALOGUE_MODEL,
    max_tokens: 2000,
    system: KNOWLEDGE_EXTRACTION_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  let raw = "";
  for (const block of response.content) {
    if (block.type === "text") raw += block.text;
  }

  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\n/, "");
    cleaned = cleaned.replace(/\n```\s*$/, "");
  }

  const parsed = JSON.parse(cleaned) as {
    insights: Array<{
      insight_text: string;
      category: string;
      systems_involved: string[];
      conditions: string[];
      confidence: number;
    }>;
  };

  let stored = 0;
  const dialogueIds = dialogues.map((d) => d.id);

  await withTenant(tenantId, async (c) => {
    // Store insights
    for (const insight of parsed.insights ?? []) {
      // Check for similar existing insights to avoid duplicates
      const { rows: existing } = await c.query<{ id: string; times_confirmed: number }>(
        `SELECT id, times_confirmed FROM practitioner_knowledge
         WHERE practitioner_id = $1 AND category = $2
           AND insight_text ILIKE $3 AND active = true
         LIMIT 1`,
        [practitionerId, insight.category, `%${insight.insight_text.slice(0, 50)}%`],
      );

      if (existing.length > 0) {
        // Existing insight — increment confirmation count
        await c.query(
          `UPDATE practitioner_knowledge
             SET times_confirmed = times_confirmed + 1,
                 confidence = LEAST(confidence + 0.1, 1.0),
                 supporting_dialogue_ids = supporting_dialogue_ids || $1,
                 updated_at = now()
           WHERE id = $2`,
          [dialogueIds, existing[0]!.id],
        );
      } else {
        // New insight
        await c.query(
          `INSERT INTO practitioner_knowledge
             (tenant_id, practitioner_id, insight_text, category,
              supporting_dialogue_ids, confidence, systems_involved,
              conditions, tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            tenantId,
            practitionerId,
            insight.insight_text,
            insight.category,
            dialogueIds,
            insight.confidence,
            insight.systems_involved ?? [],
            insight.conditions ?? [],
            [],
          ],
        );
        stored++;
      }
    }

    // Mark dialogues as processed
    await c.query(
      `UPDATE clinical_dialogues
         SET learning_extracted = true
       WHERE id = ANY($1)`,
      [dialogueIds],
    );
  });

  console.log(`[clinical-dialogue] Extracted ${stored} new insight(s), confirmed existing where applicable`);
  return stored;
}
