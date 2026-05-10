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
import { callModel, loadPrompt, stripCodeFences } from "./llm";

const DIALOGUE_MODEL = "claude-sonnet-4-5-20250929";
const QUESTION_PROMPT_VERSION = "clinical_question_v1";
const KNOWLEDGE_EXTRACTION_PROMPT_VERSION = "clinical_knowledge_extraction_v1";

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

  const response = await callModel({
    model: DIALOGUE_MODEL,
    maxTokens: 3000,
    system: loadPrompt(QUESTION_PROMPT_VERSION),
    messages: [{ role: "user", content: userContent }],
    timeoutMs: 60_000,
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("[clinical-dialogue] Questions generated in", elapsed + "s");

  const parsed = JSON.parse(stripCodeFences(response.text)) as {
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

  const response = await callModel({
    model: DIALOGUE_MODEL,
    maxTokens: 2000,
    system: loadPrompt(KNOWLEDGE_EXTRACTION_PROMPT_VERSION),
    messages: [{ role: "user", content: userContent }],
    timeoutMs: 60_000,
  });

  const parsed = JSON.parse(stripCodeFences(response.text)) as {
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
