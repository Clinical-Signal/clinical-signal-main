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

/** Resolves a dispatch address for the magic-link email (dev fallback when none on file). */
export function resolvePatientIntakeEmail(
  intakeData: IntakeData | undefined,
  patientId: string,
  displayName?: string | null,
): string {
  const fromIntake = readContactEmail(intakeData);
  if (fromIntake) {
    return fromIntake;
  }

  const slug =
    displayName
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "") || "patient";

  return `${slug}.${patientId.slice(0, 8)}@intake.example.com`;
}
