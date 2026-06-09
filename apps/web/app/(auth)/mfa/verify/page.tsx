import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getMfaEnrollmentState } from "@/lib/auth/mfa";
import { isSessionMfaVerified } from "@/lib/session";

import { VerifyForm } from "./verify-form";

export default async function MfaVerifyPage() {
  const user = await auth();
  if (!user) {
    redirect("/login");
  }

  const state = await getMfaEnrollmentState(user.practitionerId);
  if (!state.enrolled) {
    redirect("/mfa/enroll");
  }

  if (await isSessionMfaVerified(user.sessionId)) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl text-ink">Two-factor verification</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Enter the 6-digit code from your authenticator app to continue.
        </p>
      </div>
      <VerifyForm />
    </div>
  );
}
