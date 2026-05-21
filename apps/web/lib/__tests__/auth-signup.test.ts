/**
 * Unit tests for the rewritten signup() in lib/auth.ts.
 *
 * Covers Issue #0's transactional provisioning behavior:
 *   a) Happy path — one tenant + one practitioner + signing-authority FK
 *      + session, all in one transaction; lifecycle_status defaults to
 *      'pending_baa'.
 *   b) Practice name fallback to "${name}'s practice" when practiceName
 *      is undefined or whitespace.
 *   c) Duplicate email — transaction rolls back, friendly error,
 *      no tenant row leaks.
 *   d) Dev escape hatch — ATTACH_TO_DEFAULT_TENANT=true plus
 *      NODE_ENV=development plus DEFAULT_TENANT_ID set → attach to the
 *      default tenant without provisioning a new one.
 *
 * Run with: npx vitest run lib/__tests__/auth-signup.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks. vi.mock is hoisted, so these run before lib/auth.ts imports them.
// ---------------------------------------------------------------------------

// Fake pool with two surfaces:
//   - pool.connect() → returns a client with query/release that records calls
//     and pulls scripted responses from `clientResponses`.
//   - pool.query(sql, params) → for the dev-escape-hatch path which uses the
//     pool directly without a transactional client. Scripted via
//     `poolResponses`.
//
// Each test resets the queues + recorded calls in beforeEach.

interface QueryResult {
  rows: Array<Record<string, unknown>>;
}
type ScriptedResponse = QueryResult | Error;

const clientResponses: ScriptedResponse[] = [];
const poolResponses: ScriptedResponse[] = [];
const clientCalls: Array<{ sql: string; params: unknown[] | undefined }> = [];
const poolCalls: Array<{ sql: string; params: unknown[] | undefined }> = [];
let clientReleased = false;

function pullResponse(queue: ScriptedResponse[]): QueryResult {
  if (queue.length === 0) {
    throw new Error("test setup error: response queue exhausted");
  }
  const next = queue.shift()!;
  if (next instanceof Error) throw next;
  return next;
}

vi.mock("../db", () => {
  return {
    pool: {
      async connect() {
        clientReleased = false;
        return {
          async query(sql: string, params?: unknown[]) {
            clientCalls.push({ sql, params });
            // BEGIN / COMMIT / ROLLBACK are housekeeping — no scripted
            // response needed; return an empty rows array.
            const trimmed = sql.trim().toUpperCase();
            if (trimmed === "BEGIN" || trimmed === "COMMIT" || trimmed === "ROLLBACK") {
              return { rows: [] };
            }
            return pullResponse(clientResponses);
          },
          release() {
            clientReleased = true;
          },
        };
      },
      async query(sql: string, params?: unknown[]) {
        poolCalls.push({ sql, params });
        return pullResponse(poolResponses);
      },
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  clientResponses.length = 0;
  poolResponses.length = 0;
  clientCalls.length = 0;
  poolCalls.length = 0;
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
    clientResponses.push(
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

    expect(result).toEqual({ ok: true });
    // BEGIN, INSERT tenants, INSERT practitioners, UPDATE tenants, COMMIT
    expect(clientCalls.map(c => c.sql.trim().split(/\s+/)[0])).toEqual([
      "BEGIN", "INSERT", "INSERT", "UPDATE", "COMMIT",
    ]);

    const tenantInsert = clientCalls[1]!;
    expect(tenantInsert.sql).toContain("INSERT INTO tenants");
    expect(tenantInsert.sql).toContain("'pending_baa'");
    // tenants row gets practice name in BOTH name and legal_name slots
    expect(tenantInsert.params).toEqual(["Alice's Functional Health"]);

    const practitionerInsert = clientCalls[2]!;
    expect(practitionerInsert.sql).toContain("INSERT INTO practitioners");
    expect(practitionerInsert.sql).toContain("'owner'");
    expect(practitionerInsert.params).toEqual([
      "tenant-uuid-1",
      "alice@example.com",      // email_lower
      "alice@example.com",      // email
      "hashed:supersecret",
      "Alice Doe",
    ]);

    const updateCall = clientCalls[3]!;
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
    clientResponses.push(
      { rows: [{ id: "tenant-uuid-2" }] },
      { rows: [{ id: "practitioner-uuid-2" }] },
      { rows: [] },
    );

    const result = await signup({
      email: "bob@example.com",
      password: "anothersecret",
      name: "Bob Smith",
    });

    expect(result).toEqual({ ok: true });
    expect(clientCalls[1]!.params).toEqual(["Bob Smith's practice"]);
  });

  it("falls back when practiceName is whitespace-only", async () => {
    clientResponses.push(
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

    expect(result).toEqual({ ok: true });
    expect(clientCalls[1]!.params).toEqual(["Carol Vega's practice"]);
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

    // Fails before any DB call — no client checkout, no pool.query
    expect(clientCalls).toEqual([]);
    expect(poolCalls).toEqual([]);
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("accepts practiceName exactly 120 chars", async () => {
    clientResponses.push(
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

    expect(result).toEqual({ ok: true });
    expect(clientCalls[1]!.params).toEqual([exactly120]);
  });
});

// ---------------------------------------------------------------------------
// (c) Duplicate email — transaction rolls back
// ---------------------------------------------------------------------------

describe("signup — duplicate email rolls back", () => {
  it("returns friendly error, ROLLs BACK, releases client, no session/audit", async () => {
    const dupError = Object.assign(new Error("duplicate key"), { code: "23505" });

    clientResponses.push(
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
    expect(clientCalls.map(c => c.sql.trim().split(/\s+/)[0])).toEqual([
      "BEGIN", "INSERT", "INSERT", "ROLLBACK",
    ]);

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

    poolResponses.push({ rows: [{ id: "practitioner-uuid-dev" }] });

    const result = await signup({
      email: "dev@example.com",
      password: "devpassword",
      name: "Dev User",
    });

    expect(result).toEqual({ ok: true });
    // No transactional client used — straight pool.query
    expect(clientCalls).toEqual([]);
    expect(poolCalls).toHaveLength(1);
    expect(poolCalls[0]!.sql).toContain("INSERT INTO practitioners");
    expect(poolCalls[0]!.params).toEqual([
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

    clientResponses.push(
      { rows: [{ id: "tenant-uuid-prod" }] },
      { rows: [{ id: "practitioner-uuid-prod" }] },
      { rows: [] },
    );

    const result = await signup({
      email: "prodlike@example.com",
      password: "prodpassword",
      name: "Prod User",
    });

    expect(result).toEqual({ ok: true });
    expect(clientCalls.length).toBeGreaterThan(0);  // transactional path taken
    expect(poolCalls).toEqual([]);                  // dev path NOT taken
  });

  it("does NOT require DEFAULT_TENANT_ID on the main path", async () => {
    // No DEFAULT_TENANT_ID, no ATTACH_TO_DEFAULT_TENANT — main path must
    // still work and not return "Server misconfigured: DEFAULT_TENANT_ID unset."
    clientResponses.push(
      { rows: [{ id: "tenant-uuid-nodef" }] },
      { rows: [{ id: "practitioner-uuid-nodef" }] },
      { rows: [] },
    );

    const result = await signup({
      email: "nodef@example.com",
      password: "nodefpassword",
      name: "Nodef User",
    });

    expect(result).toEqual({ ok: true });
  });
});
