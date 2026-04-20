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
  docCount: number;
  hasPrepBrief: boolean;
  protocolStatus: string | null;
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
      doc_count: string;
      has_prep_brief: boolean;
      protocol_status: string | null;
    }>(
      `SELECT p.id,
              pgp_sym_decrypt(p.name_encrypted, $1)::text AS name,
              CASE WHEN p.dob_encrypted IS NULL THEN NULL
                   ELSE pgp_sym_decrypt(p.dob_encrypted, $1)::text END AS dob,
              p.status,
              p.updated_at,
              COALESCE((SELECT COUNT(*)::text FROM intake_documents d WHERE d.patient_id = p.id), '0') AS doc_count,
              EXISTS(SELECT 1 FROM intake_documents d WHERE d.patient_id = p.id AND d.metadata->>'type' = 'prep_brief') AS has_prep_brief,
              (SELECT pr.status FROM protocols pr WHERE pr.patient_id = p.id ORDER BY pr.created_at DESC LIMIT 1) AS protocol_status
         FROM patients p
        ORDER BY p.updated_at DESC`,
      [phiKey()],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      dob: r.dob,
      status: r.status,
      updatedAt: r.updated_at,
      docCount: parseInt(r.doc_count, 10) || 0,
      hasPrepBrief: r.has_prep_brief,
      protocolStatus: r.protocol_status,
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
