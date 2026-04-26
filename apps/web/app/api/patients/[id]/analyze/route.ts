import { apiAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  gatherPatientTimeline,
  runClinicalAnalysis,
  insertAnalysis,
} from "@/lib/analysis";

export const maxDuration = 300;

export async function POST(
  _req: Request,
  ctx: { params: { id: string } },
) {
  const user = await apiAuth();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });

  const patientId = ctx.params.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      const t0 = Date.now();
      function elapsed() { return ((Date.now() - t0) / 1000).toFixed(1) + "s"; }

      try {
        console.log("[analyze] Starting for patient", patientId);
        send({ status: "Gathering patient data..." });

        const timeline = await gatherPatientTimeline(user.tenantId, patientId);
        console.log("[analyze] Timeline gathered at", elapsed(), "—", timeline.records.length, "records");

        send({
          status: "Analyzing intake and lab records...",
          detail: `${timeline.records.length} completed record(s)`,
        });

        const timelineText = formatTimeline(timeline);

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
        console.log("[analyze] Analysis complete at", elapsed(), "— tokens:", meta.token_usage);

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
        console.log("[analyze] Saved analysis", analysisId, "at", elapsed());

        await writeAudit({
          action: "analysis_generated",
          tenantId: user.tenantId,
          practitionerId: user.practitionerId,
          metadata: { patient_id: patientId, analysis_id: analysisId },
        });

        send({ done: true, analysisId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[analyze] FAILED at", elapsed(), "—", msg);
        send({ error: msg });
      }
      console.log("[analyze] Stream closing at", elapsed());
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
    sections.push("\n## Records\n(none — generate protocol from intake data alone)");
  } else {
    sections.push("\n## Records (" + t.records.length + " complete)");
    for (const r of t.records) {
      sections.push("### " + r.recordType + " — " + (r.recordDate ?? "undated"));
      sections.push(JSON.stringify(r.structuredData, null, 2));
    }
  }
  return sections.join("\n");
}
