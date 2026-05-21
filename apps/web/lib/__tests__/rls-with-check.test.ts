/**
 * Integration tests for the WITH CHECK clauses introduced by
 * migration 0025_rls_with_check_hardening.sql.
 *
 * Run with:
 *   DATABASE_URL=postgresql://clinical_signal:change_me_dev_only@localhost:5432/clinical_signal \
 *   APP_USER_DATABASE_URL=postgresql://app_user:app_user_dev_password@localhost:5432/clinical_signal \
 *   npx vitest run lib/__tests__/rls-with-check.test.ts
 *
 * Why two URLs:
 *   - Setup and teardown insert/delete test rows that span two tenants. RLS
 *     would block that for `app_user`, so the fixture connection uses the
 *     superuser DSN (DATABASE_URL).
 *   - The actual cross-tenant attempt connects as `app_user` because that's
 *     what the application uses at runtime. Only `app_user` is FORCEd to
 *     obey RLS — superusers bypass it.
 *
 * Skipped when the URLs aren't set so this file is safe to leave in the
 * default vitest run on a developer's machine. CI provides the URLs.
 *
 * Scope:
 *   1. Schema-level proof — every affected policy now has a WITH CHECK
 *      clause populated in pg_policies. (The migration's own DO block
 *      already asserts this; we re-assert from the test layer so a
 *      regression in a later migration that drops the clause is caught
 *      independently of fresh apply.)
 *   2. Runtime-level proof on practitioner_knowledge — the table with
 *      the simplest schema among the 8 affected. We INSERT a row under
 *      tenant A, then prove that as `app_user` with the GUC set to
 *      tenant A:
 *        a) UPDATE'ing the row to set tenant_id = tenant B fails.
 *        b) INSERT'ing a fresh row with tenant_id = tenant B fails.
 *        c) UPDATE'ing within tenant A (no tenant change) succeeds.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const SUPER_URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_USER_DATABASE_URL;
const integrationEnabled = !!SUPER_URL && !!APP_URL;

// Stable test UUIDs so a half-finished run can be cleaned up by hand.
const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const PRACTITIONER_A = "33333333-3333-3333-3333-333333333333";

const AFFECTED_TABLES = [
  "patient_timeline",
  "protocol_outputs",
  "protocol_edits",
  "suggested_preferences",
  "clinical_dialogues",
  "practitioner_knowledge",
  "foundational_plans",
  "practitioner_preferences",
] as const;

describe.skipIf(!integrationEnabled)("RLS WITH CHECK hardening (migration 0025)", () => {
  let superClient: pg.Client;
  let appClient: pg.Client;

  beforeAll(async () => {
    superClient = new pg.Client({ connectionString: SUPER_URL });
    appClient = new pg.Client({ connectionString: APP_URL });
    await superClient.connect();
    await appClient.connect();

    // Best-effort cleanup of any rows from a prior failed run before
    // we set up fresh fixtures.
    await superClient.query(
      `DELETE FROM practitioner_knowledge WHERE tenant_id IN ($1, $2)`,
      [TENANT_A, TENANT_B],
    );
  });

  afterAll(async () => {
    if (superClient) {
      await superClient.query(
        `DELETE FROM practitioner_knowledge WHERE tenant_id IN ($1, $2)`,
        [TENANT_A, TENANT_B],
      );
      await superClient.end();
    }
    if (appClient) {
      await appClient.end();
    }
  });

  // -------------------------------------------------------------------------
  // 1. Schema-level proof: pg_policies has both clauses for every table.
  // -------------------------------------------------------------------------
  it.each(AFFECTED_TABLES)(
    "policy on %s has both USING and WITH CHECK populated",
    async (table) => {
      const { rows } = await superClient.query(
        `SELECT qual IS NOT NULL AS has_using,
                with_check IS NOT NULL AS has_with_check
           FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = $1
            AND policyname = 'tenant_isolation'`,
        [table],
      );
      expect(rows, `missing tenant_isolation policy on ${table}`).toHaveLength(1);
      expect(rows[0].has_using).toBe(true);
      expect(rows[0].has_with_check).toBe(true);
    },
  );

  // -------------------------------------------------------------------------
  // 2. Runtime proof on practitioner_knowledge.
  // -------------------------------------------------------------------------
  describe("runtime enforcement on practitioner_knowledge", () => {
    let seededRowId: string;

    beforeAll(async () => {
      // Insert a row under tenant A as superuser (bypasses RLS).
      const { rows } = await superClient.query<{ id: string }>(
        `INSERT INTO practitioner_knowledge
           (tenant_id, practitioner_id, insight_text, category, supporting_dialogue_ids)
         VALUES ($1, $2, 'integration-test seed', 'clinical_reasoning', ARRAY[]::uuid[])
         RETURNING id`,
        [TENANT_A, PRACTITIONER_A],
      );
      seededRowId = rows[0].id;
    });

    it("UPDATE that crosses tenants is rejected by WITH CHECK", async () => {
      // app_user with tenant A's GUC. The seeded row is visible (USING
      // matches), but the new tenant_id violates WITH CHECK.
      await appClient.query("BEGIN");
      try {
        await appClient.query("SELECT set_config('app.current_tenant_id', $1, true)", [
          TENANT_A,
        ]);

        await expect(
          appClient.query(
            `UPDATE practitioner_knowledge
                SET tenant_id = $1
              WHERE id = $2`,
            [TENANT_B, seededRowId],
          ),
        ).rejects.toThrow(/row-level security|with check/i);
      } finally {
        await appClient.query("ROLLBACK");
      }
    });

    it("INSERT into a different tenant is rejected by WITH CHECK", async () => {
      await appClient.query("BEGIN");
      try {
        await appClient.query("SELECT set_config('app.current_tenant_id', $1, true)", [
          TENANT_A,
        ]);

        await expect(
          appClient.query(
            `INSERT INTO practitioner_knowledge
               (tenant_id, practitioner_id, insight_text, category, supporting_dialogue_ids)
             VALUES ($1, $2, 'should not land', 'clinical_reasoning', ARRAY[]::uuid[])`,
            [TENANT_B, PRACTITIONER_A],
          ),
        ).rejects.toThrow(/row-level security|with check/i);
      } finally {
        await appClient.query("ROLLBACK");
      }
    });

    it("UPDATE that stays within tenant A succeeds (sanity check)", async () => {
      await appClient.query("BEGIN");
      try {
        await appClient.query("SELECT set_config('app.current_tenant_id', $1, true)", [
          TENANT_A,
        ]);

        const { rowCount } = await appClient.query(
          `UPDATE practitioner_knowledge
              SET insight_text = 'updated within tenant A'
            WHERE id = $1`,
          [seededRowId],
        );
        expect(rowCount).toBe(1);
      } finally {
        await appClient.query("ROLLBACK");
      }
    });
  });
});

describe.skipIf(integrationEnabled)("RLS WITH CHECK integration (skipped)", () => {
  // Visible in vitest output so a developer running `npm run test:unit`
  // without the integration env vars knows the suite was intentionally
  // skipped rather than missing.
  it("requires DATABASE_URL and APP_USER_DATABASE_URL", () => {
    expect(true).toBe(true);
  });
});
