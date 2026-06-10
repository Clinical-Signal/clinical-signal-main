import { Badge } from "@/components/ui/badge";
import type { IntakeStatus } from "@/lib/db/schema/patients-intake";
import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";
import type { IntakeChatMessageRow } from "@/lib/intake/intake-chat-store";

import { StepTwoInsights } from "@/app/clinician/intake/[token]/step-two-insights";

import { PatientIntakeChatTranscript } from "./patient-intake-chat-transcript";
import { PatientIntakeStepOneSummary } from "./patient-intake-step-one-summary";

const STATUS_LABELS: Record<IntakeStatus, string> = {
  not_started: "Not started",
  step1_complete: "Step 1 complete",
  step2_complete: "Step 2 complete",
  labs_pending: "Labs pending",
  reviewed: "Reviewed",
};

type PatientIntakeSummaryProps = {
  intakeStatus: IntakeStatus;
  intakeData: IntakeData;
  chatMessages: IntakeChatMessageRow[];
  patientName: string;
};

export function PatientIntakeSummary({
  intakeStatus,
  intakeData,
  chatMessages,
  patientName,
}: PatientIntakeSummaryProps) {
  const preferredName = intakeData.about_you.full_name.trim() || patientName;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="accent">{STATUS_LABELS[intakeStatus] ?? intakeStatus}</Badge>
        <p className="text-sm text-ink-muted">
          Reviewing intake for <span className="font-medium text-ink">{preferredName}</span>
        </p>
      </div>

      <section>
        <h2 className="mb-4 font-serif text-xl text-ink">Step 1 — Baseline intake</h2>
        <PatientIntakeStepOneSummary intakeData={intakeData} />
      </section>

      <section>
        <h2 className="mb-4 font-serif text-xl text-ink">Step 2 — Structured follow-up</h2>
        <StepTwoInsights intakeData={intakeData} />
      </section>

      <section>
        <h2 className="mb-4 font-serif text-xl text-ink">Step 2 — Follow-up chat</h2>
        <PatientIntakeChatTranscript messages={chatMessages} />
      </section>
    </div>
  );
}
