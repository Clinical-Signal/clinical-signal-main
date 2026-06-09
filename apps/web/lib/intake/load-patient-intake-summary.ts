import { withTenant } from "@/lib/db";

import { listMainIntakeChatMessages, type IntakeChatMessageRow } from "./intake-chat-store";
import { getPatientIntakeState, type PatientIntakeState } from "./patient-intake-store";

export type PatientIntakeSummaryData = {
  state: PatientIntakeState;
  latestTokenId: string | null;
  chatMessages: IntakeChatMessageRow[];
};

async function getLatestIntakeTokenId(
  tenantId: string,
  patientId: string,
): Promise<string | null> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id
         FROM intake_tokens
        WHERE patient_id = $1
          AND tenant_id = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [patientId, tenantId],
    );
    return rows[0]?.id ?? null;
  });
}

export async function loadPatientIntakeSummary(
  tenantId: string,
  patientId: string,
): Promise<PatientIntakeSummaryData | null> {
  const state = await getPatientIntakeState(tenantId, patientId);
  if (!state) {
    return null;
  }

  const latestTokenId = await getLatestIntakeTokenId(tenantId, patientId);
  const chatMessages = latestTokenId
    ? await listMainIntakeChatMessages(tenantId, latestTokenId)
    : [];

  return { state, latestTokenId, chatMessages };
}
