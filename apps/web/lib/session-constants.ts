// Safe-for-Edge constants. No Node / pg / next/headers imports.
export const SESSION_COOKIE_NAME = "cs_session";
/** Set after MFA challenge; middleware checks this because Edge cannot query Postgres. */
export const MFA_VERIFIED_COOKIE_NAME = "cs_mfa_verified";
/** Mirrors practitioners.role at login; Edge middleware reads this for SEC-6 page gates. */
export const ROLE_COOKIE_NAME = "cs_role";
