/**
 * Mock intake magic-link email dispatch (Phase 0 — replace with Resend/SES in production).
 * PHI-free: logs recipient + URL only; never logs intake answers.
 */

export type DispatchIntakeEmailInput = {
  patientEmail: string;
  intakeUrl: string;
};

export async function dispatchIntakeEmail(input: DispatchIntakeEmailInput): Promise<void> {
  console.log(
    `[intake-email] Email sent to ${input.patientEmail} with link: ${input.intakeUrl}`,
  );
}
