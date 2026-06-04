import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { Page } from "@/components/ui/page";
import {
  ClinicianIntakeAccessError,
  loadClinicianIntakeByToken,
} from "@/lib/intake/load-clinician-intake";
import { extractClientIp } from "@/lib/tokens/intake-token-api";

import { ClinicianIntakeHeader } from "./clinician-intake-header";
import { ClinicalSynthesisView } from "./clinical-synthesis-view";
import { StepOneSummary } from "./step-one-summary";
import { StepTwoInsights } from "./step-two-insights";

type PageProps = {
  params: { token: string };
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
        <ClinicianIntakeHeader
          patientId={review.patientId}
          preferredName={preferredName}
          intakeStatus={review.intakeStatus}
          analysisDegraded={Boolean(review.intakeData._analysis_degraded)}
        />

        <div className="mb-10">
          <ClinicalSynthesisView
            token={rawToken}
            savedSynthesis={review.synthesisResolved}
          />
        </div>

        <div className="flex flex-col gap-10">
          <section>
            <h2 className="mb-4 font-serif text-xl text-ink">Step 1 — Baseline</h2>
            <StepOneSummary intakeData={review.intakeData} />
          </section>

          <section>
            <h2 className="mb-4 font-serif text-xl text-ink">Step 2 — Deep dive</h2>
            <StepTwoInsights intakeData={review.intakeData} />
          </section>
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
