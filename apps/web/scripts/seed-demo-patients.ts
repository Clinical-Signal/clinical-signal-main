#!/usr/bin/env npx tsx
/**
 * Seeds three synthetic demo patients with completed Step-1 intake and active tokens.
 *
 * Run from apps/web (requires DATABASE_URL + PHI_ENCRYPTION_KEY in .env):
 *   pnpm run seed:demo
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { randomUUID } from "node:crypto";

import type { TenantContext } from "@cs/core";
import { withSystem, withTenantContext } from "@cs/db";

import { withTenant } from "@/lib/db";
import { createPatient } from "@/lib/patients";
import type { IntakeStatus } from "@/lib/db/schema/patients-intake";
import { savePatientIntakeData } from "@/lib/intake/patient-intake-store";
import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";
import {
  generateRawIntakeToken,
  hashIntakeToken,
  INTAKE_TOKEN_DEFAULTS,
} from "@/lib/tokens/intake-token";

import {
  DEMO_PATIENT_CONTACT_EMAIL,
  DEMO_PATIENT_FIXTURES,
  validateDemoPatientFixtures,
} from "./demo-patient-fixtures";

export type DemoPatientLink = {
  name: string;
  patientId: string;
  clinicianUrl: string;
  patientUrl: string;
};

export type SeedDemoPatientsResult = {
  tenantId: string;
  links: DemoPatientLink[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const DEV_EMAIL = "dev@example.com";

function loadDotEnv(): void {
  const envPath = resolve(__dirname, "../.env");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function nameSearchHash(name: string): string {
  return createHash("sha256").update(name.trim().toLowerCase()).digest("hex");
}

async function resolveDevPractitioner(): Promise<{
  tenantId: string;
  practitionerId: string;
}> {
  return withSystem({ reason: "seed_demo_patients_resolve_practitioner" }, async (client) => {
    const { rows } = await client.query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id
         FROM practitioners
        WHERE email_lower = $1
        LIMIT 1`,
      [DEV_EMAIL],
    );

    const row = rows[0];
    if (!row) {
      throw new Error(
        `Practitioner ${DEV_EMAIL} not found. Run database/migrations/0003_seed_dev.sql first.`,
      );
    }

    return { tenantId: row.tenant_id, practitionerId: row.id };
  });
}

async function findPatientIdByName(
  tenantId: string,
  displayName: string,
): Promise<string | null> {
  const hash = nameSearchHash(displayName);
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM patients WHERE tenant_id = $1 AND name_search_hash = $2 LIMIT 1`,
      [tenantId, hash],
    );
    return rows[0]?.id ?? null;
  });
}

async function setIntakeStatus(
  tenantId: string,
  patientId: string,
  status: IntakeStatus,
): Promise<void> {
  await withTenant(tenantId, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE patients SET intake_status = $3 WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId, status],
    );
    if (rowCount === 0) {
      throw new Error(`Patient ${patientId} not found for intake status update`);
    }
  });
}

async function upsertDemoPatient(input: {
  tenantId: string;
  practitionerId: string;
  displayName: string;
  dob: string;
  notes: string;
  intakeData: IntakeData;
}): Promise<string> {
  let patientId = await findPatientIdByName(input.tenantId, input.displayName);

  if (!patientId) {
    patientId = await createPatient({
      tenantId: input.tenantId,
      practitionerId: input.practitionerId,
      name: input.displayName,
      email: DEMO_PATIENT_CONTACT_EMAIL,
      dob: input.dob,
      notes: input.notes,
    });
    console.log(`Created patient: ${input.displayName} (${patientId})`);
  } else {
    console.log(`Updating existing patient: ${input.displayName} (${patientId})`);
  }

  await savePatientIntakeData(input.tenantId, patientId, input.intakeData);
  await setIntakeStatus(input.tenantId, patientId, "step1_complete");

  return patientId;
}

function demoBaseUrl(): string {
  return (
    process.env.DEMO_APP_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function tenantContext(tenantId: string, practitionerId: string): TenantContext {
  return {
    tenantId,
    practitionerId,
    sessionId: "seed-demo-patients",
    role: "practitioner",
    lifecycleStatus: "active",
  };
}

async function reissueIntakeToken(input: {
  tenantId: string;
  patientId: string;
  createdBy: string;
}): Promise<{ token: string; tokenId: string }> {
  const rawToken = generateRawIntakeToken();
  const tokenHash = hashIntakeToken(rawToken);
  const tokenId = randomUUID();
  const expiresAt = new Date(
    Date.now() + INTAKE_TOKEN_DEFAULTS.ttlDays * 24 * 60 * 60 * 1000,
  );

  await withTenantContext(tenantContext(input.tenantId, input.createdBy), async (client) => {
    await client.query(
      `UPDATE intake_tokens
          SET revoked_at = now()
        WHERE patient_id = $1
          AND revoked_at IS NULL
          AND status = 'pending'`,
      [input.patientId],
    );
    await client.query(
      `INSERT INTO intake_tokens (
         id, patient_id, tenant_id, token_hash, expires_at, created_by, use_count, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'pending')`,
      [tokenId, input.patientId, input.tenantId, tokenHash, expiresAt, input.createdBy],
    );
  });

  return { token: rawToken, tokenId };
}

export async function seedDemoPatients(): Promise<SeedDemoPatientsResult> {
  validateDemoPatientFixtures();

  const { tenantId, practitionerId } = await resolveDevPractitioner();
  const baseUrl = demoBaseUrl();
  const links: DemoPatientLink[] = [];

  for (const fixture of DEMO_PATIENT_FIXTURES) {
    const intakeData = fixture.buildIntakeData();
    const patientId = await upsertDemoPatient({
      tenantId,
      practitionerId,
      displayName: fixture.displayName,
      dob: fixture.dob,
      notes: fixture.notes,
      intakeData,
    });

    const minted = await reissueIntakeToken({
      patientId,
      tenantId,
      createdBy: practitionerId,
    });

    links.push({
      name: fixture.displayName,
      patientId,
      clinicianUrl: `${baseUrl}/clinician/intake/${minted.token}`,
      patientUrl: `${baseUrl}/intake/${minted.token}`,
    });
  }

  return { tenantId, links };
}

function printDemoLinks(result: SeedDemoPatientsResult): void {
  if (result.tenantId !== DEV_TENANT_ID) {
    console.warn(
      `Warning: dev practitioner tenant is ${result.tenantId}, expected ${DEV_TENANT_ID}.`,
    );
  }

  console.log("\nDemo patients ready (Step 1 complete, active intake tokens).\n");
  console.log("Log in as dev@example.com / devpassword12! then open:\n");

  for (const link of result.links) {
    console.log(`${link.name}`);
    console.log(`  Clinician review: ${link.clinicianUrl}`);
    console.log(`  Patient intake:   ${link.patientUrl}`);
    console.log("");
  }
}

async function main(): Promise<void> {
  loadDotEnv();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required (set in apps/web/.env)");
  }
  if (!process.env.PHI_ENCRYPTION_KEY) {
    throw new Error("PHI_ENCRYPTION_KEY is required (set in apps/web/.env)");
  }

  const result = await seedDemoPatients();
  printDemoLinks(result);
}

main().catch((error) => {
  console.error("[seed-demo-patients] failed:", error);
  process.exit(1);
});
