import { requireAuth } from "@/lib/auth";
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
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });

  const patientId = ctx.params.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      try {
        send({ status: "Gathering patient data..." });

        const timeline = await gatherPatientTimeline(user.tenantId, patientId);

        send({
          status: "Analyzing intake and lab records...",
          detail: `${timeline.records.length} completed record(s)`,
        });

        // Send keepalive pings every 15s while Claude is thinking so the
        // client knows the connection is alive.
        const keepalive = setInterval(() => {
          send({ ping: true, status: "Still analyzing — Claude is thinking..." });
        }, 15_000);

        const timelineText = formatTimeline(timeline);
        let findings, meta, raw;
        try {
          ({ findings, meta, raw } = await runClinicalAnalysis(timelineText));
        } finally {
          clearInterval(keepalive);
        }

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

        await writeAudit({
          action: "analysis_generated",
          tenantId: user.tenantId,
          practitionerId: user.practitionerId,
          metadata: { patient_id: patientId, analysis_id: analysisId },
        });

        send({ done: true, analysisId });
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
