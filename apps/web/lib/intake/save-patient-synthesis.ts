import { withTenantContext } from "@cs/db";
import type { TenantContext } from "@cs/core";

import type { SynthesisResolved } from "./schemas/synthesis-resolved.schema";

function tenantContext(tenantId: string): TenantContext {
  return {
    tenantId,
    practitionerId: "00000000-0000-0000-0000-000000000000",
    sessionId: "clinician-synthesis-save",
    role: "practitioner",
    lifecycleStatus: "active",
  };
}

/** Persists clinical synthesis under `intake_data.step_two._synthesis_resolved` (RLS via tenant). */
export async function savePatientSynthesisResolved(
  tenantId: string,
  patientId: string,
  synthesis: SynthesisResolved,
): Promise<{ savedAt: string }> {
  const savedAt = new Date().toISOString();

  await withTenantContext(tenantContext(tenantId), async (client) => {
    const { rowCount } = await client.query(
      `UPDATE patients
          SET intake_data = jsonb_set(
                COALESCE(intake_data, '{}'::jsonb),
                '{step_two,_synthesis_resolved}',
                $3::jsonb,
                true
              )
        WHERE id = $1
          AND tenant_id = $2`,
      [patientId, tenantId, JSON.stringify(synthesis)],
    );

    if (rowCount === 0) {
      throw new Error("Patient not found");
    }
  });

  return { savedAt };
}
