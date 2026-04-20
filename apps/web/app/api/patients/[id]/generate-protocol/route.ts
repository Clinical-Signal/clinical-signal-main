import { apiAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  gatherPatientTimeline,
  runClinicalAnalysis,
  runProtocolGeneration,
  insertAnalysis,
  insertProtocol,
} from "@/lib/analysis";

export const maxDuration = 60;

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

        send({
          step: 2,
          total: 3,
          status: "Analyzing intake and lab records...",
          detail: `${timeline.records.length} record(s) found`,
        });

        const timelineText = formatTimeline(timeline);
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

function formatTimeline(t: {
  intakeData: Record<string, unknown>;
  records: Array<{
    recordId: string;
    recordType: string;
    recordDate: string | null;
    structuredData: Record<string, unknown>;
  }>;
}): string {
  const sections: string[] = [];
  sections.push("## Intake");
  sections.push(JSON.stringify(t.intakeData, null, 2));
  if (t.records.length === 0) {
    sections.push("\n## Records\n(none)");
  } else {
    sections.push("\n## Records (" + t.records.length + " complete)");
    for (const r of t.records) {
      sections.push("### " + r.recordType + " — " + (r.recordDate ?? "undated") + " (id " + r.recordId + ")");
      sections.push(JSON.stringify(r.structuredData, null, 2));
    }
  }
  return sections.join("\n");
}
