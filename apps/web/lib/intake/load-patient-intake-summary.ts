import { withTenant } from "@/lib/db";

import { listMainIntakeChatMessages, type IntakeChatMessageRow } from "./intake-chat-store";
import { getPatientIntakeState, type PatientIntakeState } from "./patient-intake-store";

export type PatientIntakeSummaryData = {
  state: PatientIntakeState;
  latestTokenId: string | null;
  chatMessages: IntakeChatMessageRow[];
};

/** Prefer the token that actually has chat messages (avoids empty view after reissue). */
async function getIntakeTokenIdForSummary(
  tenantId: string,
  patientId: string,
): Promise<string | null> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT t.id
         FROM intake_tokens t
        WHERE t.patient_id = $1
          AND t.tenant_id = $2
        ORDER BY
          (SELECT COUNT(*)::int FROM intake_chat_messages m WHERE m.intake_token_id = t.id) DESC,
          CASE WHEN t.status = 'completed' THEN 0 ELSE 1 END,
          t.created_at DESC
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

  const latestTokenId = await getIntakeTokenIdForSummary(tenantId, patientId);
  const chatMessages = latestTokenId
    ? await listMainIntakeChatMessages(tenantId, latestTokenId)
    : [];

  return { state, latestTokenId, chatMessages };
}
