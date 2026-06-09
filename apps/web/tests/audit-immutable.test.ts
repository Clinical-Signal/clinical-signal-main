/**
 * Integration tests for audit_log immutability (SEC-7 / migration 0027).
 *
 * Run after applying database/migrations/0027_audit_log_grants.sql:
 *
 *   DATABASE_URL=postgresql://clinical_signal:change_me_dev_only@localhost:5432/clinical_signal \
 *   APP_USER_DATABASE_URL=postgresql://app_user:app_user_dev_password@localhost:5432/clinical_signal \
 *   npx vitest run tests/audit-immutable.test.ts
 *
 * Skipped when URLs are unset so default `pnpm test:unit` stays green offline.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const SUPER_URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_USER_DATABASE_URL;
const integrationEnabled = !!SUPER_URL && !!APP_URL;

const PROBE_ACTION = "sec7_immutability_probe";

function isPermissionDenied(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "42501"
  );
}

describe.skipIf(!integrationEnabled)("audit_log immutability (SEC-7 / migration 0027)", () => {
  let superClient: pg.Client;
  let appClient: pg.Client;
  let probeId: string | null = null;

  beforeAll(async () => {
    superClient = new pg.Client({ connectionString: SUPER_URL });
    appClient = new pg.Client({ connectionString: APP_URL });
    await superClient.connect();
    await appClient.connect();

    await superClient.query(`DELETE FROM audit_log WHERE action = $1`, [PROBE_ACTION]);
  });

  afterAll(async () => {
    if (superClient) {
      await superClient.query(`DELETE FROM audit_log WHERE action = $1`, [PROBE_ACTION]);
      await superClient.end();
    }
    if (appClient) {
      await appClient.end();
    }
  });

  it("app_user can INSERT and SELECT audit_log", async () => {
    const insert = await appClient.query<{ id: string }>(
      `INSERT INTO audit_log (action, metadata)
       VALUES ($1, '{}'::jsonb)
       RETURNING id::text`,
      [PROBE_ACTION],
    );
    probeId = insert.rows[0]!.id;

    const select = await appClient.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_log WHERE id = $1`,
      [probeId],
    );
    expect(select.rows[0]?.count).toBe("1");
  });

  it("app_user cannot UPDATE audit_log", async () => {
    expect(probeId).not.toBeNull();

    await expect(
      appClient.query(`UPDATE audit_log SET action = 'tamper' WHERE id = $1`, [probeId]),
    ).rejects.toSatisfy(isPermissionDenied);
  });

  it("app_user cannot DELETE audit_log", async () => {
    expect(probeId).not.toBeNull();

    await expect(
      appClient.query(`DELETE FROM audit_log WHERE id = $1`, [probeId]),
    ).rejects.toSatisfy(isPermissionDenied);
  });

  it("table grants exclude UPDATE and DELETE for app_user", async () => {
    const { rows } = await superClient.query<{ privilege_type: string }>(
      `SELECT privilege_type
         FROM information_schema.table_privileges
        WHERE table_schema = 'public'
          AND table_name = 'audit_log'
          AND grantee = 'app_user'
        ORDER BY privilege_type`,
    );

    const privileges = rows.map((row) => row.privilege_type);
    expect(privileges).toContain("INSERT");
    expect(privileges).toContain("SELECT");
    expect(privileges).not.toContain("UPDATE");
    expect(privileges).not.toContain("DELETE");
    expect(privileges).not.toContain("TRUNCATE");
  });
});
