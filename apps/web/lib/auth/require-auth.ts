/**
 * Intake module auth stub (PRD Phase 0.5 / A4).
 * Separate from legacy `@/lib/auth` — swap implementation when merged.
 */
export type Session = {
  userId: string;
  tenantId: string;
  role: "owner" | "practitioner" | "viewer" | "coach";
};

export async function requireAuth(): Promise<Session> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Intake requireAuth stub is not available in production");
  }

  const userId =
    process.env.SUPABASE_DEV_USER_ID ?? "00000000-0000-0000-0000-000000000099";
  const tenantId =
    process.env.DEFAULT_TENANT_ID ?? "00000000-0000-0000-0000-000000000001";

  return {
    userId,
    tenantId,
    role: "practitioner",
  };
}
