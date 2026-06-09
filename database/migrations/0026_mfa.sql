-- 0026_mfa.sql — TOTP MFA (SEC-2): encrypted practitioner secret + session verification stamp.

ALTER TABLE practitioners
  ADD COLUMN IF NOT EXISTS mfa_secret_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN practitioners.mfa_secret_encrypted IS
  'pgcrypto-encrypted TOTP secret (SEC-2 / SEC-3a). Written at enrollment begin; mfa_enrolled_at set on confirm.';

COMMENT ON COLUMN practitioners.mfa_enrolled_at IS
  'Set when the practitioner confirms TOTP enrollment; NULL while pending.';

COMMENT ON COLUMN sessions.mfa_verified_at IS
  'Set after successful MFA challenge for this session; NULL until verified post-login.';
