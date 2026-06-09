import { NextResponse } from "next/server";

import { writeAudit } from "@/lib/audit/write-audit";
import { apiAuth } from "@/lib/auth";
import { enforceCapability } from "@/lib/auth/require-role";
import { buildPatientIntakeUrl } from "@/lib/intake/build-intake-url";
import { dispatchIntakeEmail } from "@/lib/intake/dispatch-intake-email";
import { getPatientIntakeState } from "@/lib/intake/patient-intake-store";
import { resolvePatientIntakeEmail } from "@/lib/intake/resolve-patient-intake-email";
import { patientBelongsToTenant } from "@/lib/records";
import { IntakeTokenError } from "@/lib/tokens/intake-token";
import { logSafeError } from "@/lib/log-safe";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

const EMAIL_DISPATCH_FAILED_MESSAGE =
  "Failed to dispatch email. Please try again.";

export async function POST(
  _request: Request,
  ctx: { params: { id: string } },
): Promise<Response> {
  const user = await apiAuth();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const denied = await enforceCapability(user, "issue_intake_token");
  if (denied) return denied;

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
    const patientEmail = resolvePatientIntakeEmail(state?.intakeData);
    if (!patientEmail) {
      return NextResponse.json(
        { error: "PATIENT_EMAIL_REQUIRED" },
        { status: 400 },
      );
    }

    const intakeUrl = buildPatientIntakeUrl(minted.token);

    try {
      await dispatchIntakeEmail({ patientEmail, intakeUrl });
    } catch (emailError) {
      logSafeError("[send-intake] email_dispatch_failed", emailError);
      return NextResponse.json(
        {
          error: "EMAIL_DISPATCH_FAILED",
          message: EMAIL_DISPATCH_FAILED_MESSAGE,
        },
        { status: 500 },
      );
    }

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
      status: "pending",
    });
  } catch (error) {
    if (error instanceof IntakeTokenError && error.code === "active_token_exists") {
      return NextResponse.json({ error: "ACTIVE_TOKEN_EXISTS" }, { status: 409 });
    }

    logSafeError("[send-intake] failed", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
