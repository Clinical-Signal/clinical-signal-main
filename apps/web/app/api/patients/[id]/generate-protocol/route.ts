import { apiAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  gatherPatientTimeline,
  formatTimelineForPrompt,
  runClinicalAnalysis,
  runProtocolGeneration,
  insertAnalysis,
  insertProtocol,
} from "@/lib/analysis";
import { getDocumentText } from "@/lib/intake-documents";
import { recordProtocolGenerated } from "@/lib/timeline";

export const maxDuration = 300;

export async function POST(
  _req: Request,
  ctx: { params: { id: string } },
) {
  const user = await apiAuth();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) {
    return Response.json({ error: "Patient not found" }, { status: 404 });
  }

  const patientId = ctx.params.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      try {
        send({ step: 1, total: 3, status: "Gathering patient data..." });

        const timeline = await gatherPatientTimeline(user.tenantId, patientId);

        // Fetch uploaded documents, transcripts, and practitioner notes from Intake Hub
        let docTexts: string[] = [];
        try {
          docTexts = await getDocumentText(user.tenantId, patientId);
          console.log("[generate-protocol] Loaded", docTexts.length, "intake hub documents");
        } catch (docErr) {
          console.error("[generate-protocol] Failed to load intake docs (non-fatal):", docErr);
        }

        send({
          step: 2,
          total: 3,
          status: "Analyzing intake and lab records...",
          detail: `${timeline.records.length} record(s), ${docTexts.length} document(s)`,
        });

        const timelineText = formatTimelineForPrompt(timeline, docTexts);
        const { findings, meta: aMeta, raw: aRaw } = await runClinicalAnalysis(timelineText);

        const analysisId = await insertAnalysis({
          tenantId: user.tenantId,
          patientId,
          practitionerId: user.practitionerId,
          analysisType: "full_history",
          inputRecordIds: timeline.recordIds,
          findings,
          meta: aMeta,
          raw: aRaw,
        });

        await writeAudit({
          action: "analysis_generated",
          tenantId: user.tenantId,
          practitionerId: user.practitionerId,
          metadata: { patient_id: patientId, analysis_id: analysisId },
        });

        send({
          step: 3,
          total: 3,
          status: "Drafting clinical protocol and client action plan...",
        });

        const { protocol, meta: pMeta } = await runProtocolGeneration(findings);

        const title = (protocol.title as string) || "Draft Protocol";
        const clinicalContent = (protocol.clinical_protocol ?? {}) as Record<string, unknown>;
        const clientContent = (protocol.client_action_plan ?? {}) as Record<string, unknown>;
        (clinicalContent as Record<string, unknown>)._generation = {
          ...pMeta,
          ...(protocol.meta ? { model_meta: protocol.meta } : {}),
        };

        const protocolId = await insertProtocol({
          tenantId: user.tenantId,
          patientId,
          practitionerId: user.practitionerId,
          analysisId,
          title,
          clinicalContent,
          clientContent,
        });

        await writeAudit({
          action: "protocol_generated",
          tenantId: user.tenantId,
          practitionerId: user.practitionerId,
          metadata: { patient_id: patientId, analysis_id: analysisId, protocol_id: protocolId },
        });

        // Record in PatientTimeline (non-blocking)
        recordProtocolGenerated(
          user.tenantId, patientId, protocolId, user.practitionerId, title,
        ).catch((err) => console.error("[timeline] Failed to record protocol generated:", err));

        send({
          step: 3,
          total: 3,
          status: "Complete",
          done: true,
          protocolId,
          analysisId,
          redirect: `/dashboard/patients/${patientId}/protocol/${protocolId}`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}

