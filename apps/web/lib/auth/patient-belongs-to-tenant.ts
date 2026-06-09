/**
 * Intake module tenant guard stub (PRD Phase 0.5).
 * Separate from legacy `@/lib/records` patientBelongsToTenant.
 */
export async function patientBelongsToTenant(
  patientId: string,
  tenantId: string,
): Promise<boolean> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Intake patientBelongsToTenant stub is not available in production",
    );
  }

  void patientId;
  void tenantId;
  return true;
}
