import { withTenantContext } from "@cs/db";
import type { TenantContext } from "@cs/core";

import {
  createEmptyIntakeData,
  normalizeIntakeData,
  type IntakeData,
} from "@/lib/intake/schemas/intake-data.schema";
import type { IntakeStatus } from "@/lib/db/schema/patients-intake";

export type PatientIntakeState = {
  patientId: string;
  tenantId: string;
  intakeStatus: IntakeStatus;
  intakeData: IntakeData;
};

function tenantContext(tenantId: string): TenantContext {
  return {
    tenantId,
    practitionerId: "00000000-0000-0000-0000-000000000000",
    sessionId: "patient-intake-token",
    role: "practitioner",
    lifecycleStatus: "active",
  };
}


export async function getPatientIntakeState(
  tenantId: string,
  patientId: string,
): Promise<PatientIntakeState | null> {
  return withTenantContext(tenantContext(tenantId), async (client) => {
    const { rows } = await client.query<{
      id: string;
      tenant_id: string;
      intake_status: IntakeStatus;
      intake_data: unknown;
    }>(
      `SELECT id, tenant_id, intake_status, intake_data
         FROM patients
        WHERE id = $1`,
      [patientId],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      patientId: row.id,
      tenantId: row.tenant_id,
      intakeStatus: row.intake_status,
      intakeData: normalizeIntakeData(row.intake_data),
    };
  });
}

export async function savePatientIntakeData(
  tenantId: string,
  patientId: string,
  intakeData: IntakeData,
): Promise<{ savedAt: string }> {
  const savedAt = new Date().toISOString();

  await withTenantContext(tenantContext(tenantId), async (client) => {
    const { rowCount } = await client.query(
      `UPDATE patients
          SET intake_data = $3::jsonb
        WHERE id = $1
          AND tenant_id = $2`,
      [patientId, tenantId, JSON.stringify(intakeData)],
    );

    if (rowCount === 0) {
      throw new Error("Patient not found");
    }
  });

  return { savedAt };
}

/**
 * Targeted "finalize submission" update: stamps `intake_data.submitted_at` in
 * place (via jsonb_set, never overwriting the rest of the blob) and advances the
 * patient lifecycle `status` to `labs_pending` per PRD API-4 — but only from a
 * pre-intake state, so a later stage is never rewound. `updated_at` is bumped by
 * the `patients_touch` trigger, so the dashboard row re-sorts to the top.
 *
 * Keeping both column writes in one statement makes the transition atomic and
 * keeps this a targeted partial update (no whole-record overwrite).
 */
export async function setIntakeSubmittedAt(
  tenantId: string,
  patientId: string,
  submittedAt: string,
): Promise<{ savedAt: string }> {
  await withTenantContext(tenantContext(tenantId), async (client) => {
    const { rowCount } = await client.query(
      `UPDATE patients
          SET intake_data = jsonb_set(
                COALESCE(intake_data, '{}'::jsonb),
                '{submitted_at}',
                to_jsonb($3::text),
                true
              ),
              status = CASE
                         WHEN status IN ('new', 'intake_pending') THEN 'labs_pending'
                         ELSE status
                       END
        WHERE id = $1
          AND tenant_id = $2`,
      [patientId, tenantId, submittedAt],
    );

    if (rowCount === 0) {
      throw new Error("Patient not found");
    }
  });

  return { savedAt: submittedAt };
}

/**
 * Targeted update for the analyze pipeline: writes only the Step-2 blob
 * (`step_two`) and the analysis-degraded flag. Leaves all Step-1 sections and
 * provenance untouched, so a normalized fallback can never clobber
 * patient-authored data.
 */
export async function saveIntakeAnalysisResult(
  tenantId: string,
  patientId: string,
  result: { stepTwo: Record<string, unknown>; analysisDegraded: boolean },
): Promise<{ savedAt: string }> {
  const savedAt = new Date().toISOString();

  await withTenantContext(tenantContext(tenantId), async (client) => {
    const { rowCount } = await client.query(
      `UPDATE patients
          SET intake_data = jsonb_set(
                jsonb_set(
                  COALESCE(intake_data, '{}'::jsonb),
                  '{step_two}',
                  $3::jsonb,
                  true
                ),
                '{_analysis_degraded}',
                to_jsonb($4::boolean),
                true
              )
        WHERE id = $1
          AND tenant_id = $2`,
      [patientId, tenantId, JSON.stringify(result.stepTwo), result.analysisDegraded],
    );

    if (rowCount === 0) {
      throw new Error("Patient not found");
    }
  });

  return { savedAt };
}
