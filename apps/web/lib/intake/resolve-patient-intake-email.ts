import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readContactEmail(intakeData: IntakeData | undefined): string | null {
  if (!intakeData || typeof intakeData !== "object") {
    return null;
  }

  const contact = intakeData.contact_email;
  if (typeof contact === "string" && EMAIL_PATTERN.test(contact.trim())) {
    return contact.trim();
  }

  return null;
}

/** Patient email on file (`intake_data.contact_email`) for magic-link dispatch. */
export function resolvePatientIntakeEmail(
  intakeData: IntakeData | undefined,
): string | null {
  return readContactEmail(intakeData);
}
