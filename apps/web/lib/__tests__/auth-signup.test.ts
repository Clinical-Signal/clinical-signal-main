/**
 * Unit tests for the rewritten signup() in lib/auth.ts.
 *
 * Covers the transactional provisioning behavior introduced in
 * Issue #0 and updated in Phase 1 / PR3 to flow through `withSystem`
 * from @cs/db (instead of pool.connect / pool.query directly):
 *   a) Happy path — one tenant + one practitioner + signing-authority FK
 *      + session, all in one transaction; lifecycle_status defaults to
 *      'pending_baa'. Routes through `auth_signup_provision_tenant_and_practitioner`.
 *   b) Practice name fallback to "${name}'s practice" when practiceName
 *      is undefined or whitespace.
 *   c) Duplicate email — transaction rolls back, friendly error,
 *      no tenant row leaks.
 *   d) Dev escape hatch — ATTACH_TO_DEFAULT_TENANT=true plus
 *      NODE_ENV=development plus DEFAULT_TENANT_ID set → attach to the
 *      default tenant via `auth_signup_attach_default_tenant` (single
 *      INSERT, no transaction).
 *
 * Run with: npx vitest run lib/__tests__/auth-signup.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks. vi.mock is hoisted, so these run before lib/auth.ts imports them.
// ---------------------------------------------------------------------------

// One unified call queue for everything signup() does, since after PR3
// every DB statement flows through withSystem({reason}, fn(client)) ->
// client.query — there's no separate pool.query path anymore. Each
// recorded call is tagged with the `reason` so tests can assert which
// withSystem call site fired.

interface QueryResult {
  rows: Array<Record<string, unknown>>;
}
type ScriptedResponse = QueryResult | Error;

interface RecordedCall {
  reason: string;
  sql: string;
  params: unknown[] | undefined;
}

const responses: ScriptedResponse[] = [];
const calls: RecordedCall[] = [];
let clientReleased = false;

function pullResponse(): QueryResult {
  if (responses.length === 0) {
    throw new Error("test setup error: response queue exhausted");
  }
  const next = responses.shift()!;
  if (next instanceof Error) throw next;
  return next;
}

// Stand-in for @cs/db.withSystem. Borrows a fake client whose `query`
// records the SQL+params (tagged with the reason) and pulls scripted
// responses off the shared queue. BEGIN/COMMIT/ROLLBACK are
// transactional housekeeping — no scripted response needed.
vi.mock("@cs/db", () => {
  return {
    withSystem: async <T,>(
      opts: { reason: string },
      fn: (client: {
        query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
      }) => Promise<T>,
    ): Promise<T> => {
      clientReleased = false;
      const client = {
        async query(sql: string, params?: unknown[]): Promise<QueryResult> {
          calls.push({ reason: opts.reason, sql, params });
          const trimmed = sql.trim().toUpperCase();
          if (trimmed === "BEGIN" || trimmed === "COMMIT" || trimmed === "ROLLBACK") {
            return { rows: [] };
          }
          return pullResponse();
        },
      };
      try {
        return await fn(client);
      } finally {
        clientReleased = true;
      }
    },
  };
});

const createSessionMock = vi.fn(async (_practitionerId: string) => "fake-session-token");
vi.mock("../session", () => ({
  createSession: (id: string) => createSessionMock(id),
}));

const writeAuditMock = vi.fn(async (_input: unknown) => undefined);
vi.mock("../audit", () => ({
  writeAudit: (input: unknown) => writeAuditMock(input),
}));

vi.mock("../password", () => ({
  hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`),
  validatePasswordPolicy: vi.fn(async (pw: string) =>
    pw.length >= 8
      ? { ok: true }
      : { ok: false, reason: "Password must be at least 8 characters." },
  ),
}));

// Imported AFTER the mocks above so the module resolves them through vi.mock.
import { signup } from "../auth";

// Convenience: SQL verbs in order, ignoring whitespace + casing.
function sqlVerbs(): string[] {
  return calls.map((c) => c.sql.trim().split(/\s+/)[0]!.toUpperCase());
}

const PROVISION_REASON = "auth_signup_provision_tenant_and_practitioner";
const ATTACH_REASON = "auth_signup_attach_default_tenant";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  responses.length = 0;
  calls.length = 0;
  clientReleased = false;
  createSessionMock.mockClear();
  writeAuditMock.mockClear();
  delete process.env.ATTACH_TO_DEFAULT_TENANT;
  delete process.env.DEFAULT_TENANT_ID;
  // NODE_ENV in vitest defaults to 'test'; clear so individual tests can
  // set 'development' explicitly when exercising the dev hatch.
  process.env.NODE_ENV = "test";
});

// ---------------------------------------------------------------------------
// (a) Happy path
// ---------------------------------------------------------------------------

describe("signup — happy path (provisions new tenant)", () => {
  it("inserts tenant + practitioner, sets signing_authority, creates session, audits", async () => {
    responses.push(
      { rows: [{ id: "tenant-uuid-1" }] },        // INSERT INTO tenants RETURNING id
      { rows: [{ id: "practitioner-uuid-1" }] },  // INSERT INTO practitioners RETURNING id
      { rows: [] },                               // UPDATE tenants
    );

    const result = await signup({
      email: "alice@example.com",
      password: "supersecret",
      name: "Alice Doe",
      practiceName: "Alice's Functional Health",
    });

    expect(result).toEqual({ ok: true, redirectTo: "/mfa/enroll" });
    // BEGIN, INSERT tenants, INSERT practitioners, UPDATE tenants, COMMIT
    expect(sqlVerbs()).toEqual(["BEGIN", "INSERT", "INSERT", "UPDATE", "COMMIT"]);
    // All five SQL statements went through the same withSystem reason
    for (const c of calls) expect(c.reason).toBe(PROVISION_REASON);

    const tenantInsert = calls[1]!;
    expect(tenantInsert.sql).toContain("INSERT INTO tenants");
    expect(tenantInsert.sql).toContain("'pending_baa'");
    // tenants row gets practice name in BOTH name and legal_name slots
    expect(tenantInsert.params).toEqual(["Alice's Functional Health"]);

    const practitionerInsert = calls[2]!;
    expect(practitionerInsert.sql).toContain("INSERT INTO practitioners");
    expect(practitionerInsert.sql).toContain("'owner'");
    expect(practitionerInsert.params).toEqual([
      "tenant-uuid-1",
      "alice@example.com",      // email_lower
      "alice@example.com",      // email
      "hashed:supersecret",
      "Alice Doe",
    ]);

    const updateCall = calls[3]!;
    expect(updateCall.sql).toContain("UPDATE tenants SET signing_authority_practitioner_id");
    expect(updateCall.params).toEqual(["practitioner-uuid-1", "tenant-uuid-1"]);

    // Post-commit
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(createSessionMock).toHaveBeenCalledWith("practitioner-uuid-1");
    expect(writeAuditMock).toHaveBeenCalledTimes(1);
    expect(writeAuditMock).toHaveBeenCalledWith({
      action: "signup",
      tenantId: "tenant-uuid-1",
      practitionerId: "practitioner-uuid-1",
      metadata: { event: "practice_provisioned" },
    });

    expect(clientReleased).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (b) Practice name fallback
// ---------------------------------------------------------------------------

describe("signup — practiceName fallback", () => {
  it("falls back to \"${name}'s practice\" when practiceName omitted", async () => {
    responses.push(
      { rows: [{ id: "tenant-uuid-2" }] },
      { rows: [{ id: "practitioner-uuid-2" }] },
      { rows: [] },
    );

    const result = await signup({
      email: "bob@example.com",
      password: "anothersecret",
      name: "Bob Smith",
    });

    expect(result).toEqual({ ok: true, redirectTo: "/mfa/enroll" });
    expect(calls[1]!.params).toEqual(["Bob Smith's practice"]);
  });

  it("falls back when practiceName is whitespace-only", async () => {
    responses.push(
      { rows: [{ id: "tenant-uuid-3" }] },
      { rows: [{ id: "practitioner-uuid-3" }] },
      { rows: [] },
    );

    const result = await signup({
      email: "carol@example.com",
      password: "carolsecret",
      name: "Carol Vega",
      practiceName: "   ",
    });

    expect(result).toEqual({ ok: true, redirectTo: "/mfa/enroll" });
    expect(calls[1]!.params).toEqual(["Carol Vega's practice"]);
  });
});

// ---------------------------------------------------------------------------
// (b.3) Practice name length validation
// ---------------------------------------------------------------------------

describe("signup — practiceName length validation", () => {
  it("rejects practiceName longer than 120 chars without touching DB", async () => {
    const result = await signup({
      email: "longname@example.com",
      password: "longpassword",
      name: "Long Name",
      practiceName: "x".repeat(121),
    });

    expect(result).toEqual({
      ok: false,
      error: "Practice name must be 120 characters or fewer.",
    });

    // Fails before any DB call — no withSystem invocation
    expect(calls).toEqual([]);
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("accepts practiceName exactly 120 chars", async () => {
    responses.push(
      { rows: [{ id: "tenant-uuid-edge" }] },
      { rows: [{ id: "practitioner-uuid-edge" }] },
      { rows: [] },
    );

    const exactly120 = "x".repeat(120);
    const result = await signup({
      email: "edge@example.com",
      password: "edgepassword",
      name: "Edge Case",
      practiceName: exactly120,
    });

    expect(result).toEqual({ ok: true, redirectTo: "/mfa/enroll" });
    expect(calls[1]!.params).toEqual([exactly120]);
  });
});

// ---------------------------------------------------------------------------
// (c) Duplicate email — transaction rolls back
// ---------------------------------------------------------------------------

describe("signup — duplicate email rolls back", () => {
  it("returns friendly error, ROLLs BACK, releases client, no session/audit", async () => {
    const dupError = Object.assign(new Error("duplicate key"), { code: "23505" });

    responses.push(
      { rows: [{ id: "tenant-uuid-dup" }] },  // tenant insert succeeds
      dupError,                               // practitioner insert throws 23505
    );

    const result = await signup({
      email: "dup@example.com",
      password: "duppassword",
      name: "Dup User",
    });

    expect(result).toEqual({
      ok: false,
      error: "An account with that email already exists.",
    });

    // BEGIN, INSERT tenants (ok), INSERT practitioners (throws), ROLLBACK
    expect(sqlVerbs()).toEqual(["BEGIN", "INSERT", "INSERT", "ROLLBACK"]);
    for (const c of calls) expect(c.reason).toBe(PROVISION_REASON);

    expect(createSessionMock).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
    expect(clientReleased).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (d) Dev escape hatch — ATTACH_TO_DEFAULT_TENANT
// ---------------------------------------------------------------------------

describe("signup — dev escape hatch (ATTACH_TO_DEFAULT_TENANT)", () => {
  it("attaches to DEFAULT_TENANT_ID without provisioning a new tenant", async () => {
    process.env.ATTACH_TO_DEFAULT_TENANT = "true";
    process.env.NODE_ENV = "development";
    process.env.DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

    responses.push({ rows: [{ id: "practitioner-uuid-dev" }] });

    const result = await signup({
      email: "dev@example.com",
      password: "devpassword",
      name: "Dev User",
    });

    expect(result).toEqual({ ok: true, redirectTo: "/mfa/enroll" });
    // Single non-transactional INSERT under the attach reason
    expect(calls).toHaveLength(1);
    expect(calls[0]!.reason).toBe(ATTACH_REASON);
    expect(calls[0]!.sql).toContain("INSERT INTO practitioners");
    expect(calls[0]!.params).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "dev@example.com",
      "dev@example.com",
      "hashed:devpassword",
      "Dev User",
    ]);

    expect(createSessionMock).toHaveBeenCalledWith("practitioner-uuid-dev");
    expect(writeAuditMock).toHaveBeenCalledWith({
      action: "signup",
      tenantId: "00000000-0000-0000-0000-000000000001",
      practitionerId: "practitioner-uuid-dev",
      metadata: { event: "attached_to_default_tenant" },
    });
  });

  it("does NOT activate when only ATTACH_TO_DEFAULT_TENANT is set (no NODE_ENV)", async () => {
    process.env.ATTACH_TO_DEFAULT_TENANT = "true";
    process.env.DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
    // NODE_ENV stays 'test' from beforeEach — escape hatch should NOT fire.

    responses.push(
      { rows: [{ id: "tenant-uuid-prod" }] },
      { rows: [{ id: "practitioner-uuid-prod" }] },
      { rows: [] },
    );

    const result = await signup({
      email: "prodlike@example.com",
      password: "prodpassword",
      name: "Prod User",
    });

    expect(result).toEqual({ ok: true, redirectTo: "/mfa/enroll" });
    // Provisioning path took over; no attach-default-tenant call.
    const reasons = new Set(calls.map((c) => c.reason));
    expect(reasons.has(PROVISION_REASON)).toBe(true);
    expect(reasons.has(ATTACH_REASON)).toBe(false);
  });

  it("does NOT require DEFAULT_TENANT_ID on the main path", async () => {
    // No DEFAULT_TENANT_ID, no ATTACH_TO_DEFAULT_TENANT — main path must
    // still work and not return "Server misconfigured: DEFAULT_TENANT_ID unset."
    responses.push(
      { rows: [{ id: "tenant-uuid-nodef" }] },
      { rows: [{ id: "practitioner-uuid-nodef" }] },
      { rows: [] },
    );

    const result = await signup({
      email: "nodef@example.com",
      password: "nodefpassword",
      name: "Nodef User",
    });

    expect(result).toEqual({ ok: true, redirectTo: "/mfa/enroll" });
  });
});
