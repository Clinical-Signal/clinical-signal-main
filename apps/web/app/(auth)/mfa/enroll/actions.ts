"use server";

import { redirect } from "next/navigation";

import { writeAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import {
  confirmMfaEnrollment,
  getMfaEnrollmentState,
  getOrCreateEnrollmentMaterial,
  loadMfaSecretPlaintext,
  verifyTotp,
} from "@/lib/auth/mfa";
import { markSessionMfaVerified } from "@/lib/session";

export type MfaEnrollState = {
  error?: string;
};

export async function beginEnrollment(): Promise<{
  qrDataUrl: string;
  otpauthUri: string;
  secret: string;
} | null> {
  const user = await auth();
  if (!user) {
    redirect("/login");
  }

  const state = await getMfaEnrollmentState(user.practitionerId);
  if (state.enrolled) {
    redirect("/mfa/verify");
  }

  return getOrCreateEnrollmentMaterial({
    practitionerId: user.practitionerId,
    email: user.email,
  });
}

export async function confirmEnrollmentAction(
  _prev: MfaEnrollState | undefined,
  formData: FormData,
): Promise<MfaEnrollState> {
  const user = await auth();
  if (!user) {
    redirect("/login");
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { error: "Enter the 6-digit code from your authenticator app." };
  }

  const secret = await loadMfaSecretPlaintext(user.practitionerId);
  if (!secret) {
    return { error: "Enrollment expired. Refresh this page to start again." };
  }

  if (!verifyTotp(code, secret)) {
    await writeAudit({
      action: "mfa_failed",
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      metadata: { phase: "enroll" },
    });
    return { error: "Invalid code. Check your authenticator app and try again." };
  }

  await confirmMfaEnrollment(user.practitionerId);
  await markSessionMfaVerified(user.sessionId);

  await writeAudit({
    action: "mfa_enrolled",
    tenantId: user.tenantId,
    practitionerId: user.practitionerId,
  });
  await writeAudit({
    action: "mfa_verified",
    tenantId: user.tenantId,
    practitionerId: user.practitionerId,
    metadata: { phase: "enroll" },
  });

  redirect("/dashboard");
}
