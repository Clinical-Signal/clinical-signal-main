import { createHash } from "node:crypto";
import { phiKey, withTenant } from "./db";

export type PatientStatus =
  | "new"
  | "intake_pending"
  | "labs_pending"
  | "analysis_ready"
  | "protocol_draft"
  | "active"
  | "archived";

export interface PatientListRow {
  id: string;
  name: string;
  dob: string | null;
  status: PatientStatus;
  updatedAt: Date;
}

export interface CreatePatientInput {
  tenantId: string;
  practitionerId: string;
  name: string;
  dob?: string | null;
  notes?: string | null;
}

function nameHash(name: string): string {
  return createHash("sha256").update(name.trim().toLowerCase()).digest("hex");
}

export async function listPatients(tenantId: string): Promise<PatientListRow[]> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      name: string;
      dob: string | null;
      status: PatientStatus;
      updated_at: Date;
    }>(
      `SELECT id,
              pgp_sym_decrypt(name_encrypted, $1)::text AS name,
              CASE WHEN dob_encrypted IS NULL THEN NULL
                   ELSE pgp_sym_decrypt(dob_encrypted, $1)::text END AS dob,
              status,
              updated_at
         FROM patients
        ORDER BY updated_at DESC`,
      [phiKey()],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      dob: r.dob,
      status: r.status,
      updatedAt: r.updated_at,
    }));
  });
}

export async function createPatient(input: CreatePatientInput): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  const dob = input.dob?.trim() || null;
  if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    throw new Error("DOB must be in YYYY-MM-DD format");
  }

  return withTenant(input.tenantId, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO patients
         (tenant_id, practitioner_id, name_encrypted, dob_encrypted,
          name_search_hash, status, notes)
       VALUES (
         $1, $2,
         pgp_sym_encrypt($3, $6),
         CASE WHEN $4::text IS NULL THEN NULL ELSE pgp_sym_encrypt($4, $6) END,
         $5, 'new', $7
       )
       RETURNING id`,
      [
        input.tenantId,
        input.practitionerId,
        name,
        dob,
        nameHash(name),
        phiKey(),
        input.notes?.trim() || null,
      ],
    );
    return rows[0]!.id;
  });
}
