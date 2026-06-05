import { afterEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn().mockResolvedValue({ messageId: "test-id" });

vi.mock("@/lib/email/smtp-transport", () => ({
  createSmtpTransport: () => ({ sendMail }),
}));

vi.mock("@/lib/env", () => ({
  env: {
    EMAIL_FROM_ADDRESS: "intake@clinicalsignal.com",
  },
}));

describe("dispatchIntakeEmail", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends to the patient address via SMTP without logging the magic link", async () => {
    const { dispatchIntakeEmail } = await import("./dispatch-intake-email");

    await dispatchIntakeEmail({
      patientEmail: "jane.doe@example.com",
      intakeUrl: "https://app.example.com/intake/test-token/step-one",
    });

    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "intake@clinicalsignal.com",
        to: "jane.doe@example.com",
        subject: expect.stringContaining("intake"),
      }),
    );
  });
});
