import { apiAuth } from "@/lib/auth";
import { enforceCapability } from "@/lib/auth/require-role";
import { sanitizeStreamError, ERROR_CODES } from "@/lib/api-error";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  getAnalysisFindings,
  runProtocolGeneration,
  insertProtocol,
  searchKnowledgeBase,
} from "@/lib/analysis";
import { runSafetyValidation } from "@/lib/safety-validation";
import { logDebug, logError } from "@/lib/logger";

export const maxDuration = 300;

export async function POST(
  req: Request,
  ctx: { params: { id: string } },
) {
  const user = await apiAuth();
  if (!user) return Response.json({ error: ERROR_CODES.NOT_AUTHENTICATED }, { status: 401 });

  const denied = await enforceCapability(user, "generate_protocol");
  if (denied) return denied;

  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return Response.json({ error: ERROR_CODES.NOT_FOUND }, { status: 404 });

  const patientId = ctx.params.id;
  const body = (await req.json()) as { analysisId: string };
  if (!body.analysisId) {
    return Response.json({ error: ERROR_CODES.VALIDATION_ERROR }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      function send(data: Record<string, unknown>) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        } catch {
          closed = true;
        }
      }

      const t0 = Date.now();
      function elapsed() { return ((Date.now() - t0) / 1000).toFixed(1) + "s"; }

      try {
        logDebug("generate-from-analysis", "Starting for patient", patientId, "analysis", body.analysisId);
        send({ status: "Loading analysis..." });

        const analysis = await getAnalysisFindings(user.tenantId, body.analysisId);
        if (!analysis) {
          logError("generate-from-analysis", "Analysis not found:", body.analysisId);
          send({ error: sanitizeStreamError(ERROR_CODES.NOT_FOUND, new Error("Analysis not found")) });
          if (!closed) { try { controller.close(); } catch { /* */ } }
          closed = true;
          return;
        }
        logDebug("generate-from-analysis", "Analysis loaded at", elapsed());

        send({ status: "Searching knowledge base..." });

        let kbContext: Array<Record<string, unknown>> = [];
        try {
          const kbLimit = parseInt(process.env.KB_CONTEXT_LIMIT ?? "5", 10);
          kbContext = await searchKnowledgeBase(user.tenantId, analysis.findings, kbLimit);
          logDebug("generate-from-analysis", "KB search returned", kbContext.length, "items at", elapsed());
          if (kbContext.length > 0) {
            send({
              status: "Drafting protocol with " + kbContext.length + " knowledge base insights...",
            });
          } else {
            send({ status: "Drafting clinical protocol and client action plan..." });
          }
        } catch (kbErr) {
          logError("generate-from-analysis", "KB search failed:", kbErr);
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

        // Run post-generation safety validation
        let safetyResult = null;
        try {
          send({ status: "Running safety validation..." });
          safetyResult = await runSafetyValidation(analysis.findings, protocol);
        } catch (err) {
          logError("generate-from-analysis", "Safety validation failed (non-fatal):", err);
        }

        // Attach safety validation to clinical content metadata
        if (safetyResult) {
          (clinicalContent as Record<string, unknown>)._safety_validation = {
            passed: safetyResult.passed,
            warnings: safetyResult.warnings,
            summary: safetyResult.summary,
            meta: safetyResult.meta,
          };
        }

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
          safetyValidation: safetyResult
            ? { passed: safetyResult.passed, warningCount: safetyResult.warnings.length, summary: safetyResult.summary }
            : null,
          redirect: `/dashboard/patients/${patientId}/protocol/${protocolId}`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError("generate-from-analysis", "FAILED at", elapsed(), "—", msg);
        send({ error: sanitizeStreamError(ERROR_CODES.PROTOCOL_GENERATION_FAILED, err) });
      }
      logDebug("generate-from-analysis", "Stream closing at", elapsed());
      if (!closed) {
        try { controller.close(); } catch { /* already closed */ }
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
