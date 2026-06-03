import type { PoolClient } from "@cs/db";
import { withSystem, withTenantContext } from "@cs/db";
import type { TenantContext } from "@cs/core";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNull } from "drizzle-orm";

import { intakeTokens } from "@/lib/db/schema/intake-tokens";

import type { IntakeTokenStatus } from "@/lib/db/schema/intake-token-status";

import {
  IntakeTokenError,
  type IntakeTokenRecord,
  type IntakeTokenStore,
} from "./intake-token";

type IntakeTokenPgRow = {
  id: string;
  patient_id: string;
  tenant_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  status: string;
  completed_at: Date | null;
  created_by: string;
  created_at: Date;
  last_used_at: Date | null;
  use_count: number;
};

function parseTokenStatus(value: string): IntakeTokenStatus {
  if (value === "pending" || value === "completed" || value === "expired") {
    return value;
  }
  return "pending";
}

function pgRowToRecord(row: IntakeTokenPgRow): IntakeTokenRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    tenantId: row.tenant_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? null,
    status: parseTokenStatus(row.status ?? "pending"),
    completedAt: row.completed_at ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? null,
    useCount: row.use_count,
  };
}

function tenantContext(tenantId: string, practitionerId: string): TenantContext {
  return {
    tenantId,
    practitionerId,
    sessionId: "intake-token-store",
    role: "practitioner",
    lifecycleStatus: "active",
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

function dbFromClient(client: PoolClient) {
  return drizzle(client);
}

async function findActiveByPatientIdWithClient(
  client: PoolClient,
  patientId: string,
): Promise<IntakeTokenRecord | null> {
  const db = dbFromClient(client);
  const rows = await db
    .select()
    .from(intakeTokens)
    .where(
      and(
        eq(intakeTokens.patientId, patientId),
        isNull(intakeTokens.revokedAt),
        eq(intakeTokens.status, "pending"),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row
    ? pgRowToRecord({
        id: row.id,
        patient_id: row.patientId,
        tenant_id: row.tenantId,
        token_hash: row.tokenHash,
        expires_at: row.expiresAt,
        revoked_at: row.revokedAt,
        status: row.status,
        completed_at: row.completedAt,
        created_by: row.createdBy,
        created_at: row.createdAt,
        last_used_at: row.lastUsedAt,
        use_count: row.useCount,
      })
    : null;
}

async function lookupByHash(client: PoolClient, tokenHash: string): Promise<IntakeTokenRecord | null> {
  const { rows } = await client.query<IntakeTokenPgRow>(
    "SELECT * FROM lookup_intake_token_by_hash($1)",
    [tokenHash],
  );
  const row = rows[0];
  return row ? pgRowToRecord(row) : null;
}

async function lookupById(client: PoolClient, tokenId: string): Promise<IntakeTokenRecord | null> {
  const { rows } = await client.query<IntakeTokenPgRow>(
    "SELECT * FROM lookup_intake_token_by_id($1::uuid)",
    [tokenId],
  );
  const row = rows[0];
  return row ? pgRowToRecord(row) : null;
}

async function lookupActiveByPatient(
  client: PoolClient,
  patientId: string,
): Promise<IntakeTokenRecord | null> {
  const { rows } = await client.query<IntakeTokenPgRow>(
    "SELECT * FROM lookup_active_intake_token_by_patient($1::uuid)",
    [patientId],
  );
  const row = rows[0];
  return row ? pgRowToRecord(row) : null;
}

export class DrizzleIntakeTokenStore implements IntakeTokenStore {
  async insert(record: IntakeTokenRecord): Promise<void> {
    const ctx = tenantContext(record.tenantId, record.createdBy);

    await withTenantContext(ctx, async (client) => {
      const active = await findActiveByPatientIdWithClient(client, record.patientId);
      if (active) {
        throw new IntakeTokenError(
          "active_token_exists",
          "patient already has an active intake token",
        );
      }

      const db = dbFromClient(client);
      try {
        await db.insert(intakeTokens).values({
          id: record.id,
          patientId: record.patientId,
          tenantId: record.tenantId,
          tokenHash: record.tokenHash,
          expiresAt: record.expiresAt,
          revokedAt: record.revokedAt,
          status: record.status,
          completedAt: record.completedAt,
          createdBy: record.createdBy,
          createdAt: record.createdAt,
          lastUsedAt: record.lastUsedAt,
          useCount: record.useCount,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new IntakeTokenError(
            "active_token_exists",
            "patient already has an active intake token",
          );
        }
        throw error;
      }
    });
  }

  async findByHash(tokenHash: string): Promise<IntakeTokenRecord | null> {
    return withSystem({ reason: "intake_token_hash_lookup_for_verify" }, async (client) =>
      lookupByHash(client, tokenHash),
    );
  }

  async findById(tokenId: string): Promise<IntakeTokenRecord | null> {
    return withSystem({ reason: "intake_token_lookup_by_id" }, async (client) =>
      lookupById(client, tokenId),
    );
  }

  async findActiveByPatientId(patientId: string): Promise<IntakeTokenRecord | null> {
    return withSystem(
      { reason: "intake_token_active_lookup_by_patient" },
      async (client) => lookupActiveByPatient(client, patientId),
    );
  }

  async update(record: IntakeTokenRecord): Promise<void> {
    const ctx = tenantContext(record.tenantId, record.createdBy);

    await withTenantContext(ctx, async (client) => {
      const db = dbFromClient(client);
      await db
        .update(intakeTokens)
        .set({
          tokenHash: record.tokenHash,
          expiresAt: record.expiresAt,
          revokedAt: record.revokedAt,
          status: record.status,
          completedAt: record.completedAt,
          lastUsedAt: record.lastUsedAt,
          useCount: record.useCount,
        })
        .where(eq(intakeTokens.id, record.id));
    });
  }
}
