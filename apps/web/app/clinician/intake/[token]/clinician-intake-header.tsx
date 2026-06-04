import Link from "next/link";

import { PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import type { IntakeStatus } from "@/lib/db/schema/patients-intake";

const STATUS_LABELS: Record<IntakeStatus, string> = {
  not_started: "Not started",
  step1_complete: "Step 1 complete",
  step2_complete: "Step 2 complete",
  labs_pending: "Labs pending",
  reviewed: "Reviewed",
};

const STATUS_TONE: Record<
  IntakeStatus,
  "neutral" | "warning" | "success" | "accent"
> = {
  not_started: "neutral",
  step1_complete: "warning",
  step2_complete: "accent",
  labs_pending: "warning",
  reviewed: "success",
};

type ClinicianIntakeHeaderProps = {
  patientId: string;
  preferredName: string;
  intakeStatus: IntakeStatus;
  analysisDegraded: boolean;
};

export function ClinicianIntakeHeader({
  patientId,
  preferredName,
  intakeStatus,
  analysisDegraded,
}: ClinicianIntakeHeaderProps) {
  return (
    <>
      <div className="mb-2">
        <Link
          href={`/dashboard/patients/${patientId}`}
          className="text-sm text-ink-subtle transition-colors hover:text-ink"
        >
          ← Back to patient
        </Link>
      </div>

      <PageHeader
        eyebrow="Provider handoff"
        title={`Intake review — ${preferredName}`}
        description="Read-only summary of the patient’s completed intake. Use this view to prepare for your first clinical conversation."
        actions={
          <Badge tone={STATUS_TONE[intakeStatus]}>
            {STATUS_LABELS[intakeStatus]}
          </Badge>
        }
      />

      {analysisDegraded ? (
        <p className="mb-6 rounded-md border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          Step 2 analysis used a degraded fallback. Confirm critical answers directly
          with the patient if anything looks incomplete.
        </p>
      ) : null}
    </>
  );
}
