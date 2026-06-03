import { phiKey, withTenant } from "@/lib/db";

/** Decrypted patient display name for non-PHI email routing (mock dispatch only). */
export async function getPatientDisplayName(
  tenantId: string,
  patientId: string,
): Promise<string | null> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query<{ name: string }>(
      `SELECT pgp_sym_decrypt(name_encrypted, $2)::text AS name
         FROM patients
        WHERE id = $1`,
      [patientId, phiKey()],
    );
    return rows[0]?.name?.trim() ?? null;
  });
}
