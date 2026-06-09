import { NextResponse } from "next/server";

import { apiAuth } from "@/lib/auth";
import {
  isIntakeTokenConflict,
  PatientIntakeEmailDispatchError,
  PatientIntakeEmailRequiredError,
  sendPatientIntakeLink,
} from "@/lib/intake/send-patient-intake-link";
import { patientBelongsToTenant } from "@/lib/records";
import { logSafeError } from "@/lib/log-safe";

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

  const patientId = ctx.params.id;
  const belongs = await patientBelongsToTenant(user.tenantId, patientId);
  if (!belongs) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const minted = await sendPatientIntakeLink({
      patientId,
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
    });

    return NextResponse.json({
      tokenId: minted.tokenId,
      expiresAt: minted.expiresAt.toISOString(),
      status: "pending",
    });
  } catch (error) {
    if (error instanceof PatientIntakeEmailRequiredError) {
      return NextResponse.json(
        { error: "PATIENT_EMAIL_REQUIRED" },
        { status: 400 },
      );
    }
    if (error instanceof PatientIntakeEmailDispatchError) {
      return NextResponse.json(
        {
          error: "EMAIL_DISPATCH_FAILED",
          message: EMAIL_DISPATCH_FAILED_MESSAGE,
        },
        { status: 500 },
      );
    }
    if (isIntakeTokenConflict(error)) {
      return NextResponse.json({ error: "ACTIVE_TOKEN_EXISTS" }, { status: 409 });
    }

    logSafeError("[send-intake] failed", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
