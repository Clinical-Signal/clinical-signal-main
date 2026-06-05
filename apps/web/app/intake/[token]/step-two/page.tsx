import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { writeAudit } from "@/lib/audit/write-audit";
import { logSafeError } from "@/lib/log-safe";
import { listIntakeChatMessages } from "@/lib/intake/intake-chat-store";
import { partitionIntakeChatRows } from "@/lib/intake/partition-intake-chat-messages";
import { getPatientIntakeState } from "@/lib/intake/patient-intake-store";
import { extractClientIp } from "@/lib/tokens/intake-token-api";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

import { StepTwoEntry } from "./step-two-entry";

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

/** Step 2 — Bedrock chat interviewer (replaces static question plan UI). */
export default async function StepTwoPage({ params }: PageProps) {
  const rawToken = params.token?.trim();
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
        surface: "step_two_chat",
      },
    });

    const rows = await listIntakeChatMessages(verified.tenantId, verified.tokenId);
    const { mainMessages, branches } = partitionIntakeChatRows(rows);

    return (
      <StepTwoEntry
        token={rawToken}
        initialMessages={mainMessages}
        initialBranches={branches}
      />
    );
  } catch (error) {
    logSafeError("[step-two/page]", error);
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <p role="alert" className="text-sm text-danger">
          Could not load your intake chat. Try refreshing the page.
        </p>
      </div>
    );
  }
}
