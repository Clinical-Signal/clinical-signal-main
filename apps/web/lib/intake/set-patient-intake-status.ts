import { withTenantContext } from "@cs/db";
import type { TenantContext } from "@cs/core";

import type { IntakeStatus } from "@/lib/db/schema/patients-intake";

function tenantContext(tenantId: string): TenantContext {
  return {
    tenantId,
    practitionerId: "00000000-0000-0000-0000-000000000000",
    sessionId: "intake-status",
    role: "practitioner",
    lifecycleStatus: "active",
  };
}

export async function setPatientIntakeStatus(
  tenantId: string,
  patientId: string,
  intakeStatus: IntakeStatus,
): Promise<void> {
  await withTenantContext(tenantContext(tenantId), async (client) => {
    const { rowCount } = await client.query(
      `UPDATE patients SET intake_status = $3 WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId, intakeStatus],
    );
    if (rowCount === 0) {
      throw new Error("Patient not found");
    }
  });
}
