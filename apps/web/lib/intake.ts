// Server-only intake DB layer. All pure types/helpers live in
// ./intake-schema and are re-exported here for backwards-compat with
// existing server-side imports. Client components MUST import from
// ./intake-schema directly to avoid pulling `pg` into the browser bundle.

import { phiKey, withTenant } from "./db";
import type { PatientStatus } from "./patients";
import {
  type IntakeData,
  type IntakeSectionKey,
  intakeCompletionPct,
} from "./intake-schema";

export * from "./intake-schema";

// ---------------------------------------------------------------------------
// DB ops
// ---------------------------------------------------------------------------

export async function getIntake(tenantId: string, patientId: string): Promise<IntakeData> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ intake_data: IntakeData }>(
      "SELECT intake_data FROM patients WHERE id = $1",
      [patientId],
    );
    return rows[0]?.intake_data ?? {};
  });
}

export async function saveIntakeSection(
  tenantId: string,
  patientId: string,
  section: IntakeSectionKey,
  value: unknown,
): Promise<{ savedAt: string; status: PatientStatus }> {
  const savedAt = new Date().toISOString();
  return withTenant(tenantId, async (c) => {
    // jsonb || jsonb merges shallowly. We patch the section + record the
    // saved timestamp under _saved. We also bump the patient to
    // intake_pending the first time the practitioner touches the form so
    // the dashboard reflects work-in-progress.
    const { rows } = await c.query<{ status: PatientStatus }>(
      `UPDATE patients
          SET intake_data = COALESCE(intake_data, '{}'::jsonb)
                              || jsonb_build_object($3::text, $4::jsonb)
                              || jsonb_build_object('_saved',
                                   COALESCE(intake_data->'_saved','{}'::jsonb)
                                   || jsonb_build_object($3::text, $5::text)
                                 ),
              status = CASE WHEN status = 'new' THEN 'intake_pending' ELSE status END
        WHERE id = $1 AND tenant_id = $2
        RETURNING status`,
      [patientId, tenantId, section, JSON.stringify(value), savedAt],
    );
    if (!rows[0]) throw new Error("Patient not found");
    return { savedAt, status: rows[0].status };
  });
}

export async function submitIntake(
  tenantId: string,
  patientId: string,
): Promise<{ status: PatientStatus }> {
  const submittedAt = new Date().toISOString();
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ status: PatientStatus }>(
      `UPDATE patients
          SET intake_data = COALESCE(intake_data, '{}'::jsonb)
                              || jsonb_build_object('submitted_at', $3::text),
              status = CASE WHEN status IN ('new','intake_pending') THEN 'labs_pending' ELSE status END
        WHERE id = $1 AND tenant_id = $2
        RETURNING status`,
      [patientId, tenantId, submittedAt],
    );
    if (!rows[0]) throw new Error("Patient not found");
    return { status: rows[0].status };
  });
}

// ---------------------------------------------------------------------------
// Patient summary for the detail hub
// ---------------------------------------------------------------------------

export interface PatientSummary {
  id: string;
  name: string;
  dob: string | null;
  status: PatientStatus;
  intake: {
    completionPct: number;
    submittedAt: string | null;
  };
  recordCount: number;
  protocol: {
    id: string;
    title: string;
    status: string;
    version: number;
    createdAt: Date;
  } | null;
}

export async function getPatientSummary(
  tenantId: string,
  patientId: string,
): Promise<PatientSummary | null> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      name: string;
      dob: string | null;
      status: PatientStatus;
      intake_data: IntakeData;
      record_count: string;
      proto_id: string | null;
      proto_title: string | null;
      proto_status: string | null;
      proto_version: number | null;
      proto_created: Date | null;
    }>(
      `SELECT p.id,
              pgp_sym_decrypt(p.name_encrypted, $2)::text AS name,
              CASE WHEN p.dob_encrypted IS NULL THEN NULL
                   ELSE pgp_sym_decrypt(p.dob_encrypted, $2)::text
              END AS dob,
              p.status,
              p.intake_data,
              (SELECT count(*)::text FROM records r WHERE r.patient_id = p.id) AS record_count,
              latest.id AS proto_id,
              latest.title AS proto_title,
              latest.status AS proto_status,
              latest.version AS proto_version,
              latest.created_at AS proto_created
         FROM patients p
         LEFT JOIN LATERAL (
           SELECT id, title, status, version, created_at
             FROM protocols
            WHERE patient_id = p.id
            ORDER BY created_at DESC
            LIMIT 1
         ) latest ON true
        WHERE p.id = $1`,
      [patientId, phiKey()],
    );
    const r = rows[0];
    if (!r) return null;
    const intake = r.intake_data ?? {};
    return {
      id: r.id,
      name: r.name,
      dob: r.dob,
      status: r.status,
      intake: {
        completionPct: intakeCompletionPct(intake),
        submittedAt: intake.submitted_at ?? null,
      },
      recordCount: parseInt(r.record_count, 10) || 0,
      protocol: r.proto_id
        ? {
            id: r.proto_id,
            title: r.proto_title!,
            status: r.proto_status!,
            version: r.proto_version!,
            createdAt: r.proto_created!,
          }
        : null,
    };
  });
}
