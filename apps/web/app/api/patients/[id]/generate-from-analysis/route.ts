import { requireAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  getAnalysisFindings,
  runProtocolGeneration,
  insertProtocol,
} from "@/lib/analysis";

export const maxDuration = 300;

export async function POST(
  req: Request,
  ctx: { params: { id: string } },
) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });

  const patientId = ctx.params.id;
  const body = (await req.json()) as { analysisId: string };
  if (!body.analysisId) {
    return Response.json({ error: "analysisId required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      try {
        send({ status: "Loading analysis..." });

        const analysis = await getAnalysisFindings(user.tenantId, body.analysisId);
        if (!analysis) {
          send({ error: "Analysis not found or not complete." });
          controller.close();
          return;
        }

        send({ status: "Drafting clinical protocol and client action plan..." });

        const { protocol, meta } = await runProtocolGeneration(analysis.findings);

        const title = (protocol.title as string) || "Draft Protocol";
        const clinicalContent = (protocol.clinical_protocol ?? {}) as Record<string, unknown>;
        const clientContent = (protocol.client_action_plan ?? {}) as Record<string, unknown>;
        (clinicalContent as Record<string, unknown>)._generation = {
          ...meta,
          ...(protocol.meta ? { model_meta: protocol.meta } : {}),
        };

        const protocolId = await insertProtocol({
          tenantId: user.tenantId,
          patientId,
          practitionerId: user.practitionerId,
          analysisId: body.analysisId,
          title,
          clinicalContent,
          clientContent,
        });

        await writeAudit({
          action: "protocol_generated",
          tenantId: user.tenantId,
          practitionerId: user.practitionerId,
          metadata: {
            patient_id: patientId,
            analysis_id: body.analysisId,
            protocol_id: protocolId,
          },
        });

        send({
          done: true,
          protocolId,
          redirect: `/dashboard/patients/${patientId}/protocol/${protocolId}`,
        });
      } catch (err) {
        send({ error: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
