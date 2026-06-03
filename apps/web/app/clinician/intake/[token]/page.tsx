import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Page, PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import type { IntakeStatus } from "@/lib/db/schema/patients-intake";
import {
  ClinicianIntakeAccessError,
  loadClinicianIntakeByToken,
} from "@/lib/intake/load-clinician-intake";
import { extractClientIp } from "@/lib/tokens/intake-token-api";

import { ClinicalSynthesisView } from "./clinical-synthesis-view";
import { StepOneSummary } from "./step-one-summary";
import { StepTwoInsights } from "./step-two-insights";

type PageProps = {
  params: { token: string };
};

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

function requestFromHeaders(): Request {
  const headerList = headers();
  const forwarded = headerList.get("x-forwarded-for") ?? "";
  const realIp = headerList.get("x-real-ip") ?? "";
  return new Request("http://clinician.local/load", {
    headers: {
      ...(forwarded ? { "x-forwarded-for": forwarded } : {}),
      ...(realIp ? { "x-real-ip": realIp } : {}),
    },
  });
}

export default async function ClinicianIntakeReviewPage({ params }: PageProps) {
  const rawToken = params.token;
  if (!rawToken) {
    notFound();
  }

  try {
    const review = await loadClinicianIntakeByToken(
      rawToken,
      extractClientIp(requestFromHeaders()),
    );
    const preferredName = review.intakeData.about_you.full_name || "Patient";

    return (
      <Page className="pb-12">
        <div className="mb-2">
          <Link
            href={`/dashboard/patients/${review.patientId}`}
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
            <Badge tone={STATUS_TONE[review.intakeStatus]}>
              {STATUS_LABELS[review.intakeStatus]}
            </Badge>
          }
        />

        {review.intakeData._analysis_degraded ? (
          <p className="mb-6 rounded-md border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
            Step 2 analysis used a degraded fallback. Confirm critical answers directly
            with the patient if anything looks incomplete.
          </p>
        ) : null}

        <ClinicalSynthesisView
          token={rawToken}
          savedSynthesis={review.synthesisResolved}
        />

        <div className="flex flex-col gap-10">
          <div>
            <h2 className="mb-4 font-serif text-xl text-ink">Step 1 — Baseline</h2>
            <StepOneSummary intakeData={review.intakeData} />
          </div>

          <div>
            <h2 className="mb-4 font-serif text-xl text-ink">Step 2 — Deep dive</h2>
            <StepTwoInsights intakeData={review.intakeData} />
          </div>
        </div>
      </Page>
    );
  } catch (error) {
    if (error instanceof ClinicianIntakeAccessError) {
      notFound();
    }
    notFound();
  }
}
