import { withSystem } from "@cs/db";

/** Post-password auth destination before dashboard access (SEC-2). */
export async function resolvePostLoginMfaPath(
  practitionerId: string,
): Promise<"/mfa/enroll" | "/mfa/verify"> {
  const enrolled = await withSystem(
    { reason: "mfa_post_login_route_lookup" },
    async (c) => {
      const { rows } = await c.query<{ mfa_enrolled_at: Date | null }>(
        `SELECT mfa_enrolled_at FROM practitioners WHERE id = $1`,
        [practitionerId],
      );
      return rows[0]?.mfa_enrolled_at !== null;
    },
  );
  return enrolled ? "/mfa/verify" : "/mfa/enroll";
}
