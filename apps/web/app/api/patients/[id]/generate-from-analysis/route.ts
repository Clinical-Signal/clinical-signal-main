import { apiAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  getAnalysisFindings,
  runProtocolGeneration,
  insertProtocol,
  searchKnowledgeBase,
} from "@/lib/analysis";

export const maxDuration = 300;

export async function POST(
  req: Request,
  ctx: { params: { id: string } },
) {
  const user = await apiAuth();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
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

      const t0 = Date.now();
      function elapsed() { return ((Date.now() - t0) / 1000).toFixed(1) + "s"; }

      try {
        console.log("[generate-from-analysis] Starting for patient", patientId, "analysis", body.analysisId);
        send({ status: "Loading analysis..." });

        const analysis = await getAnalysisFindings(user.tenantId, body.analysisId);
        if (!analysis) {
          console.error("[generate-from-analysis] Analysis not found:", body.analysisId);
          send({ error: "Analysis not found or not complete." });
          controller.close();
          return;
        }
        console.log("[generate-from-analysis] Analysis loaded at", elapsed());

        send({ status: "Searching knowledge base..." });

        let kbContext: Array<Record<string, unknown>> = [];
        try {
          kbContext = await searchKnowledgeBase(user.tenantId, analysis.findings, 12);
          console.log("[generate-from-analysis] KB search returned", kbContext.length, "items at", elapsed());
          if (kbContext.length > 0) {
            send({
              status: "Drafting protocol with " + kbContext.length + " knowledge base insights...",
            });
          } else {
            send({ status: "Drafting clinical protocol and client action plan..." });
          }
        } catch (kbErr) {
          console.error("[generate-from-analysis] KB search failed:", kbErr);
          send({ status: "Drafting clinical protocol and client action plan..." });
        }

        let lastPing = Date.now();
        let tokenCount = 0;
        const onProgress = () => {
          tokenCount++;
          const now = Date.now();
          if (now - lastPing > 5_000) {
            send({ ping: true, status: "Writing protocol — " + tokenCount + " tokens received (" + elapsed() + ")..." });
            lastPing = now;
          }
        };

        const { protocol, meta } = await runProtocolGeneration(
          analysis.findings,
          kbContext.length > 0 ? kbContext : undefined,
          onProgress,
        );

        const title = (protocol.title as string) || "Draft Protocol";
        const clinicalContent = (protocol.clinical_protocol ?? {}) as Record<string, unknown>;
        const clientContent = (protocol.client_action_plan ?? {}) as Record<string, unknown>;
        (clinicalContent as Record<string, unknown>)._generation = {
          ...meta,
          ...(protocol.meta ? { model_meta: protocol.meta } : {}),
          ...(kbContext.length > 0
            ? {
                kb_sources: kbContext.map((k) => ({
                  id: k.id,
                  title: k.title,
                  category: k.category,
                  source_channel: k.source_channel,
                })),
              }
            : {}),
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
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[generate-from-analysis] FAILED at", elapsed(), "—", msg);
        send({ error: msg });
      }
      console.log("[generate-from-analysis] Stream closing at", elapsed());
      // Yield a microtask so the last enqueued chunk flushes before close.
      await new Promise((r) => setTimeout(r, 50));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
