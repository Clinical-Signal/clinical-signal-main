import { NextResponse } from "next/server";

import { writeAudit } from "@/lib/audit/write-audit";
import { getPatientIntakeState } from "@/lib/intake/patient-intake-store";
import { extractClientIp, tokenErrorResponse } from "@/lib/tokens/intake-token-api";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

export async function GET(
  request: Request,
  ctx: { params: { token: string } },
): Promise<Response> {
  const rawToken = ctx.params.token;
  if (!rawToken) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 404 });
  }

  try {
    const verified = await getIntakeTokenService().verify({
      rawToken,
      clientIp: extractClientIp(request),
    });

    const state = await getPatientIntakeState(verified.tenantId, verified.patientId);
    if (!state) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    await writeAudit({
      tenantId: verified.tenantId,
      actorId: null,
      action: "intake_token_accessed",
      entity: "patient",
      entityId: verified.patientId,
      payload: {
        tokenId: verified.tokenId,
      },
    });

    return NextResponse.json({
      patientId: state.patientId,
      intakeStatus: state.intakeStatus,
      intakeData: state.intakeData,
    });
  } catch (error) {
    return tokenErrorResponse(error);
  }
}
