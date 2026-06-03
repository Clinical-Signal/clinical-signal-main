import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { writeAudit } from "@/lib/audit/write-audit";
import { getPatientIntakeState } from "@/lib/intake/patient-intake-store";
import { extractClientIp } from "@/lib/tokens/intake-token-api";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

import { StepOneForm } from "./step-one-form";

type PageProps = {
  params: { token: string };
};

function requestFromHeaders(): Request {
  const headerList = headers();
  const forwarded = headerList.get("x-forwarded-for") ?? "";
  const realIp = headerList.get("x-real-ip") ?? "";
  return new Request("http://intake.local/load", {
    headers: {
      ...(forwarded ? { "x-forwarded-for": forwarded } : {}),
      ...(realIp ? { "x-real-ip": realIp } : {}),
    },
  });
}

export default async function StepOnePage({ params }: PageProps) {
  const rawToken = params.token;
  if (!rawToken) {
    notFound();
  }

  try {
    const verified = await getIntakeTokenService().verify({
      rawToken,
      clientIp: extractClientIp(requestFromHeaders()),
    });

    const state = await getPatientIntakeState(verified.tenantId, verified.patientId);
    if (!state) {
      notFound();
    }

    await writeAudit({
      tenantId: verified.tenantId,
      actorId: null,
      action: "intake_token_accessed",
      entity: "patient",
      entityId: verified.patientId,
      payload: {
        tokenId: verified.tokenId,
        surface: "step_one",
      },
    });

    return (
      <StepOneForm
        token={rawToken}
        intakeStatus={state.intakeStatus}
        initialIntakeData={state.intakeData}
      />
    );
  } catch {
    notFound();
  }
}
