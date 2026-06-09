import { apiAuth } from "@/lib/auth";
import { enforceCapability } from "@/lib/auth/require-role";
import { sanitizeStreamError, ERROR_CODES } from "@/lib/api-error";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  gatherPatientTimeline,
  formatTimelineForPrompt,
  runClinicalAnalysis,
  insertAnalysis,
} from "@/lib/analysis";
import { getDocumentText, type DocumentWithMeta } from "@/lib/intake-documents";
import { logDebug, logError } from "@/lib/logger";

export const maxDuration = 300;

export async function POST(
  _req: Request,
  ctx: { params: { id: string } },
) {
  const user = await apiAuth();
  if (!user) return Response.json({ error: ERROR_CODES.NOT_AUTHENTICATED }, { status: 401 });

  const denied = await enforceCapability(user, "generate_protocol");
  if (denied) return denied;

  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return Response.json({ error: ERROR_CODES.NOT_FOUND }, { status: 404 });

  const patientId = ctx.params.id;
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
        logDebug("analyze", "Starting for patient", patientId);
        send({ status: "Gathering patient data..." });

        const timeline = await gatherPatientTimeline(user.tenantId, patientId);
        logDebug("analyze", "Timeline gathered at", elapsed(), "—", timeline.records.length, "records");

        // Fetch uploaded documents, transcripts, and practitioner notes from Intake Hub
        let docs: DocumentWithMeta[] = [];
        try {
          docs = await getDocumentText(user.tenantId, patientId);
          logDebug("analyze", "Loaded", docs.length, "intake hub documents at", elapsed());
        } catch (docErr) {
          logError("analyze", "Failed to load intake docs (non-fatal):", docErr);
        }

        send({
          status: "Analyzing intake and lab records...",
          detail: `${timeline.records.length} record(s), ${docs.length} document(s)`,
        });

        const timelineText = formatTimelineForPrompt(timeline, docs);

        let lastPing = Date.now();
        let tokenCount = 0;
        const onProgress = () => {
          tokenCount++;
          const now = Date.now();
          if (now - lastPing > 5_000) {
            send({ ping: true, status: "Analyzing — " + tokenCount + " tokens received (" + elapsed() + ")..." });
            lastPing = now;
          }
        };

        const { findings, meta, raw } = await runClinicalAnalysis(timelineText, onProgress);
        logDebug("analyze", "Analysis complete at", elapsed(), "— tokens:", meta.token_usage);

        const analysisId = await insertAnalysis({
          tenantId: user.tenantId,
          patientId,
          practitionerId: user.practitionerId,
          analysisType: "full_history",
          inputRecordIds: timeline.recordIds,
          findings,
          meta,
          raw,
        });
        logDebug("analyze", "Saved analysis", analysisId, "at", elapsed());

        await writeAudit({
          action: "analysis_generated",
          tenantId: user.tenantId,
          practitionerId: user.practitionerId,
          metadata: { patient_id: patientId, analysis_id: analysisId },
        });

        send({ done: true, analysisId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError("analyze", "FAILED at", elapsed(), "—", msg);
        send({ error: sanitizeStreamError(ERROR_CODES.ANALYSIS_FAILED, err) });
      }
      logDebug("analyze", "Stream closing at", elapsed());
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

