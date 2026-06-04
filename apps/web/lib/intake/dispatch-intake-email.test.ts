import { afterEach, describe, expect, it, vi } from "vitest";

import { dispatchIntakeEmail } from "./dispatch-intake-email";

describe("dispatchIntakeEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a PHI-free magic-link dispatch line", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await dispatchIntakeEmail({
      patientEmail: "jane.doe@example.com",
      intakeUrl: "http://localhost:3000/intake/test-token",
    });

    expect(log).toHaveBeenCalledWith(
      "[intake-email] Email sent to jane.doe@example.com with link: http://localhost:3000/intake/test-token",
    );
  });
});
