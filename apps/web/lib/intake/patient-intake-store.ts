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
