import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getMfaEnrollmentState } from "@/lib/auth/mfa";

import { beginEnrollment } from "./actions";
import { EnrollForm } from "./enroll-form";

export default async function MfaEnrollPage() {
  const user = await auth();
  if (!user) {
    redirect("/login");
  }

  const state = await getMfaEnrollmentState(user.practitionerId);
  if (state.enrolled) {
    redirect("/mfa/verify");
  }

  const material = await beginEnrollment();
  if (!material) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl text-ink">Set up two-factor authentication</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Scan the QR code with your authenticator app, then enter the 6-digit code to
          finish enrollment.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-surface p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={material.qrDataUrl}
          alt="QR code for authenticator app setup"
          width={200}
          height={200}
          className="rounded-md"
        />
        <p
          className="break-all text-center font-mono text-xs text-ink-muted"
          data-testid="mfa-secret"
        >
          {material.secret}
        </p>
      </div>

      <EnrollForm />
    </div>
  );
}
