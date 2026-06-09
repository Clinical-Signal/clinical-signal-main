#!/usr/bin/env npx tsx
/**
 * SEC-16 — pgcrypto DEK rotation orchestrator (STUB).
 *
 * Production rotation re-encrypts all pgp_sym_* columns under a new data key.
 * This script is intentionally non-functional until dual-read ciphertext
 * versioning ships in a later sprint.
 *
 * Run from apps/web (tsx on PATH):
 *   cd apps/web && pnpm exec tsx ../../scripts/rotate-pgcrypto-key.ts
 */

const CONFIRM = process.env.CONFIRM_PGCRYPTO_ROTATION?.trim().toLowerCase();

function fail(message: string): never {
  console.error(`[rotate-pgcrypto-key] ${message}`);
  process.exit(1);
}

if (CONFIRM !== "yes") {
  fail(
    "Refusing to run: set CONFIRM_PGCRYPTO_ROTATION=yes after reading " +
      "infrastructure/aws/docs/KEY-CUSTODY.md and completing a maintenance window plan.",
  );
}

// TODO(SEC-16): Implement rotation once ciphertext version tags exist on:
//   patients (name_encrypted, dob_encrypted)
//   records.extracted_text_encrypted
//   analyses.raw_ai_response_encrypted
//   intake_documents.extracted_text_encrypted
//   document_chunks.chunk_text_encrypted
//   practitioners.mfa_secret_encrypted
//
// Required inputs (env):
//   PGCRYPTO_KEY_REF_OLD — ARN or dev ref for current DEK
//   PGCRYPTO_KEY_REF_NEW — ARN or dev ref for target DEK
//   DATABASE_URL — superuser or migrate role for batch UPDATE
//
// Algorithm sketch:
//   1. Decrypt each row with old key, re-encrypt with new key, set version column.
//   2. Batch in tenant-scoped transactions; audit each batch (PHI-free payload).
//   3. Verify row counts and spot-check decrypt before retiring old DEK version.

fail(
  "TODO(SEC-16): rotation logic not implemented. " +
    "See infrastructure/aws/docs/KEY-CUSTODY.md for the production runbook.",
);
