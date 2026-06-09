import { withTenant } from "@/lib/db";
import type { IntakeStatus } from "@/lib/db/schema/patients-intake";

/** Dashboard badge state for the patient magic-link (PHI-free). */
export type IntakeLinkDisplayStatus = "pending" | "completed" | "none";

export type PatientIntakeLinkSnapshot = {
  linkStatus: IntakeLinkDisplayStatus;
  intakeStatus: IntakeStatus | null;
};

type TokenRow = {
  status: string;
  expires_at: Date;
  revoked_at: Date | null;
};

function isActivePendingToken(row: TokenRow | undefined, now: Date): boolean {
  if (!row) {
    return false;
  }
  return (
    row.revoked_at === null &&
    row.status === "pending" &&
    row.expires_at.getTime() > now.getTime()
  );
}

function resolveLinkStatus(
  intakeStatus: IntakeStatus | null,
  latestToken: TokenRow | undefined,
  now: Date,
): IntakeLinkDisplayStatus {
  if (isActivePendingToken(latestToken, now)) {
    return "pending";
  }

  if (
    intakeStatus === "step2_complete" ||
    intakeStatus === "reviewed" ||
    latestToken?.status === "completed"
  ) {
    return "completed";
  }

  return "none";
}

export async function getPatientIntakeLinkSnapshot(
  tenantId: string,
  patientId: string,
): Promise<PatientIntakeLinkSnapshot | null> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query<{
      intake_status: IntakeStatus;
      token_status: string | null;
      expires_at: Date | null;
      revoked_at: Date | null;
    }>(
      `SELECT p.intake_status,
              t.status AS token_status,
              t.expires_at,
              t.revoked_at
         FROM patients p
         LEFT JOIN LATERAL (
           SELECT status, expires_at, revoked_at
             FROM intake_tokens
            WHERE patient_id = p.id
              AND tenant_id = p.tenant_id
            ORDER BY created_at DESC
            LIMIT 1
         ) t ON true
        WHERE p.id = $1`,
      [patientId],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const latestToken: TokenRow | undefined =
      row.token_status && row.expires_at
        ? {
            status: row.token_status,
            expires_at: row.expires_at,
            revoked_at: row.revoked_at,
          }
        : undefined;

    return {
      intakeStatus: row.intake_status,
      linkStatus: resolveLinkStatus(row.intake_status, latestToken, new Date()),
    };
  });
}
