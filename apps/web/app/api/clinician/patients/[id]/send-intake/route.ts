import { NextResponse } from "next/server";

import { writeAudit } from "@/lib/audit/write-audit";
import { apiAuth } from "@/lib/auth";
import { buildPatientIntakeUrl } from "@/lib/intake/build-intake-url";
import { dispatchIntakeEmail } from "@/lib/intake/dispatch-intake-email";
import { getPatientDisplayName } from "@/lib/intake/get-patient-display-name";
import { getPatientIntakeState } from "@/lib/intake/patient-intake-store";
import { resolvePatientIntakeEmail } from "@/lib/intake/resolve-patient-intake-email";
import { patientBelongsToTenant } from "@/lib/records";
import { IntakeTokenError } from "@/lib/tokens/intake-token";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

export async function POST(
  _request: Request,
  ctx: { params: { id: string } },
): Promise<Response> {
  const user = await apiAuth();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const patientId = ctx.params.id;
  const belongs = await patientBelongsToTenant(user.tenantId, patientId);
  if (!belongs) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const minted = await getIntakeTokenService().reissue({
      patientId,
      tenantId: user.tenantId,
      createdBy: user.practitionerId,
    });

    const state = await getPatientIntakeState(user.tenantId, patientId);
    const displayName = await getPatientDisplayName(user.tenantId, patientId);
    const patientEmail = resolvePatientIntakeEmail(
      state?.intakeData,
      patientId,
      displayName,
    );
    const intakeUrl = buildPatientIntakeUrl(minted.token);

    await dispatchIntakeEmail({ patientEmail, intakeUrl });

    await writeAudit({
      tenantId: user.tenantId,
      actorId: user.practitionerId,
      action: "intake_token_minted",
      entity: "token",
      entityId: minted.tokenId,
      payload: {
        patientId,
        dispatch: "email",
      },
    });

    await writeAudit({
      tenantId: user.tenantId,
      actorId: user.practitionerId,
      action: "intake_magic_link_sent",
      entity: "patient",
      entityId: patientId,
      payload: {
        tokenId: minted.tokenId,
      },
    });

    return NextResponse.json({
      tokenId: minted.tokenId,
      expiresAt: minted.expiresAt.toISOString(),
      intakeUrl,
      patientEmail,
      status: "pending",
    });
  } catch (error) {
    if (error instanceof IntakeTokenError && error.code === "active_token_exists") {
      return NextResponse.json({ error: "ACTIVE_TOKEN_EXISTS" }, { status: 409 });
    }

    console.error(
      "[send-intake] failed:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
