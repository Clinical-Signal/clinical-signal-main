/**
 * FR-18 — server-side readiness check collector (PRD §5.4).
 * Gathers patient state into `Check[]` for `evaluateReadiness`.
 */
import { withSystem, withTenant } from "./db";
import type { IntakeData } from "./intake/schemas/intake-data.schema";
import { normalizeIntakeData } from "./intake/schemas/intake-data.schema";
import {
  extractStepTwoAnswers,
  extractStepTwoPlan,
} from "./intake/step-two-storage";
import type { Check } from "./readiness";

type IntakeStatus =
  | "not_started"
  | "step1_complete"
  | "step2_complete"
  | "labs_pending"
  | "reviewed";

const STEP1_SUBMITTED_STATUSES = new Set<IntakeStatus>([
  "step1_complete",
  "step2_complete",
  "labs_pending",
  "reviewed",
]);

function hasAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

function intakeStep1Submitted(
  intakeStatus: IntakeStatus,
  intake: IntakeData,
): boolean {
  if (STEP1_SUBMITTED_STATUSES.has(intakeStatus)) return true;
  const submittedAt = (intake as IntakeData & { submitted_at?: string }).submitted_at;
  return typeof submittedAt === "string" && submittedAt.trim().length > 0;
}

function intakeRequiredSectionsMet(intake: IntakeData): boolean {
  const about = intake.about_you;
  const contact =
    intake.contact_email?.trim() || about.emergency_contact_phone?.trim();
  const aboutOk = !!(
    about.full_name?.trim() &&
    about.date_of_birth?.trim() &&
    about.sex_at_birth &&
    contact
  );

  const whyOk = !!(
    intake.why_here?.what_brings_you?.trim() &&
    intake.why_here?.top_three_goals?.trim()
  );

  const msqTriggered = intake.symptoms?.msq_scores
    ? Object.values(intake.symptoms.msq_scores).some((cat) =>
        cat ? Object.values(cat).some((score) => score > 0) : false,
      )
    : false;
  const symptomsOk = msqTriggered;

  const meds = intake.medications;
  const medsOk = !!(
    meds.prescriptions.some((m) => m.name.trim()) ||
    meds.supplements.some((m) => m.name.trim()) ||
    /^(none|no medications|n\/a)\b/i.test(meds.recently_stopped.trim())
  );

  const history = intake.history;
  const historyOk = !!(
    history.diagnoses.some((d) => d.condition.trim()) ||
    history.surgeries.trim() ||
    history.family_history.trim() ||
    /^(none|no history|n\/a)\b/i.test(history.surgeries.trim())
  );

  const lifestyle = intake.lifestyle;
  const lifestyleOk = !!(
    lifestyle.sleep.average_hours != null &&
    lifestyle.stress.level != null &&
    (lifestyle.exercise.frequency_per_week != null ||
      lifestyle.exercise.type.trim())
  );

  return aboutOk && whyOk && symptomsOk && medsOk && historyOk && lifestyleOk;
}

function triggeredDeepDivesMet(
  intakeStatus: IntakeStatus,
  intake: IntakeData,
): boolean {
  if (intakeStatus === "step2_complete" || intakeStatus === "reviewed") {
    return true;
  }

  const plan = extractStepTwoPlan(intake.step_two);
  if (!plan || plan.question_plan.length === 0) return false;

  const answers = extractStepTwoAnswers(intake.step_two);
  return plan.question_plan.every((mod) => {
    if (mod.was_budget_suppressed) return true;
    return mod.questions.every((q) => !q.required || hasAnswer(answers[q.id]));
  });
}

function safetyFlagsReviewed(intake: IntakeData): boolean {
  const plan = extractStepTwoPlan(intake.step_two);
  if (!plan?.red_flag_triggered) return true;

  const answers = extractStepTwoAnswers(intake.step_two);
  const screening = plan.red_flag_screening ?? [];
  if (screening.length === 0) return true;

  return screening.every((q) => hasAnswer(answers[q.id]));
}

function medicationsDetailed(intake: IntakeData): boolean {
  const rows = [
    ...intake.medications.prescriptions,
    ...intake.medications.supplements,
  ].filter((row) => row.name.trim().length > 0);

  if (rows.length === 0) return true;

  return rows.every(
    (row) => row.dosage.trim().length > 0 && row.duration.trim().length > 0,
  );
}

function labsWaived(intake: IntakeData): boolean {
  const raw = intake as IntakeData & {
    _readiness?: { labs_waived?: boolean };
    labs_waived?: boolean;
  };
  return raw._readiness?.labs_waived === true || raw.labs_waived === true;
}

function transcriptsVerified(
  docCount: number,
  verifiedCount: number,
): boolean {
  if (docCount === 0) return true;
  return verifiedCount >= docCount;
}

/**
 * TODO(Phase 4): scan `_provenance` + `_ai_confirmations` for unconfirmed AI fields (FR-10).
 */
export function collectUnconfirmedAiFields(_intake: IntakeData): string[] {
  return [];
}

export async function collectChecks(patientId: string): Promise<Check[]> {
  const patient = await withSystem(
    { reason: "readiness_collect_lookup" },
    async (c) => {
      const { rows } = await c.query<{
        tenant_id: string;
        intake_status: IntakeStatus;
        intake_data: unknown;
      }>(
        `SELECT tenant_id, intake_status, intake_data
           FROM patients
          WHERE id = $1`,
        [patientId],
      );
      return rows[0] ?? null;
    },
  );

  if (!patient) {
    throw new Error("Patient not found");
  }

  const intake = normalizeIntakeData(patient.intake_data);
  const unconfirmedAi = collectUnconfirmedAiFields(intake);

  const { labCount, transcriptDocCount, verifiedTranscriptCount } =
    await withTenant(patient.tenant_id, async (c) => {
      const labs = await c.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM records
          WHERE patient_id = $1
            AND record_type = 'lab'
            AND processing_status = 'complete'`,
        [patientId],
      );

      const docs = await c.query<{
        transcript_docs: string;
        verified_transcript_docs: string;
      }>(
        `SELECT
           COUNT(*) FILTER (
             WHERE doc_type IN ('transcript', 'note')
           )::text AS transcript_docs,
           COUNT(*) FILTER (
             WHERE doc_type IN ('transcript', 'note') AND is_verified = true
           )::text AS verified_transcript_docs
         FROM intake_documents
        WHERE patient_id = $1`,
        [patientId],
      );

      return {
        labCount: Number(labs.rows[0]?.count ?? 0),
        transcriptDocCount: Number(docs.rows[0]?.transcript_docs ?? 0),
        verifiedTranscriptCount: Number(docs.rows[0]?.verified_transcript_docs ?? 0),
      };
    });

  const labsMet = labCount > 0 || labsWaived(intake);
  const aiConfirmedMet = unconfirmedAi.length === 0;

  return [
    {
      key: "intake_step1",
      weight: "Required",
      met: intakeStep1Submitted(patient.intake_status, intake),
      gap: "intake_step1_not_submitted",
    },
    {
      key: "intake_required_sections",
      weight: "Required",
      met: intakeRequiredSectionsMet(intake),
      gap: "intake_required_sections_incomplete",
    },
    {
      key: "triggered_deep_dives",
      weight: "Required",
      met: triggeredDeepDivesMet(patient.intake_status, intake),
      gap: "triggered_deep_dives_incomplete",
    },
    {
      key: "safety_flags_reviewed",
      weight: "Required",
      met: safetyFlagsReviewed(intake),
      gap: "safety_flags_not_reviewed",
    },
    {
      key: "medications_detailed",
      weight: "High",
      met: medicationsDetailed(intake),
      gap: "medications_missing_dose_or_duration",
    },
    {
      key: "labs_present",
      weight: "High",
      met: labsMet,
      gap: "labs_missing_or_not_waived",
    },
    {
      key: "transcripts_verified",
      weight: "Medium",
      met: transcriptsVerified(transcriptDocCount, verifiedTranscriptCount),
      gap: "transcripts_not_verified",
    },
    {
      key: "ai_confirmed",
      weight: "Required-for-high",
      met: aiConfirmedMet,
      gap: "ai_fields_unconfirmed",
    },
  ];
}
