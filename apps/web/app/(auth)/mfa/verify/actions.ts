"use server";

import { redirect } from "next/navigation";

import { writeAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import {
  getMfaEnrollmentState,
  loadMfaSecretPlaintext,
  verifyTotp,
} from "@/lib/auth/mfa";
import { markSessionMfaVerified } from "@/lib/session";

export type MfaVerifyState = {
  error?: string;
};

export async function verifyChallengeAction(
  _prev: MfaVerifyState | undefined,
  formData: FormData,
): Promise<MfaVerifyState> {
  const user = await auth();
  if (!user) {
    redirect("/login");
  }

  const enrolled = await getMfaEnrollmentState(user.practitionerId);
  if (!enrolled.enrolled) {
    redirect("/mfa/enroll");
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { error: "Enter the 6-digit code from your authenticator app." };
  }

  const secret = await loadMfaSecretPlaintext(user.practitionerId);
  if (!secret) {
    return { error: "MFA is not configured for this account. Contact support." };
  }

  if (!verifyTotp(code, secret)) {
    await writeAudit({
      action: "mfa_failed",
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      metadata: { phase: "verify" },
    });
    return { error: "Invalid code. Try again." };
  }

  await markSessionMfaVerified(user.sessionId);
  await writeAudit({
    action: "mfa_verified",
    tenantId: user.tenantId,
    practitionerId: user.practitionerId,
    metadata: { phase: "verify" },
  });

  redirect("/dashboard");
}
