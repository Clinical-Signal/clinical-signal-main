import { requireAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  gatherPatientTimeline,
  generatePrepBrief,
} from "@/lib/analysis";
import { getDocumentText } from "@/lib/intake-documents";
import { withTenant } from "@/lib/db";

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

        let docTexts: string[] = [];
        try {
          docTexts = await getDocumentText(user.tenantId, patientId);
        } catch { /* non-fatal */ }

        send({
          status: "Generating prep brief...",
          detail: `${timeline.records.length} records, ${docTexts.length} documents`,
        });

        // Build timeline text with documents
        const sections: string[] = [];
        sections.push("## Intake");
        sections.push(JSON.stringify(timeline.intakeData, null, 2));

        if (timeline.records.length > 0) {
          sections.push("\n## Records (" + timeline.records.length + " complete)");
          for (const r of timeline.records) {
            sections.push("### " + r.recordType + " — " + (r.recordDate ?? "undated"));
            sections.push(JSON.stringify(r.structuredData, null, 2));
          }
        }

        if (docTexts.length > 0) {
          sections.push("\n## Uploaded documents & transcripts (" + docTexts.length + ")");
          for (let i = 0; i < docTexts.length; i++) {
            const text = docTexts[i]!;
            sections.push("\n### Document " + (i + 1));
            sections.push(text.length > 8000 ? text.slice(0, 8000) + "\n...(truncated)" : text);
          }
        }

        const timelineText = sections.join("\n");

        let lastPing = Date.now();
        const onProgress = () => {
          const now = Date.now();
          if (now - lastPing > 5_000) {
            send({ ping: true, status: "Writing prep brief..." });
            lastPing = now;
          }
        };

        const { brief, meta } = await generatePrepBrief(timelineText, onProgress);

        // Store the brief as a practitioner note so it's preserved
        await withTenant(user.tenantId, async (c) => {
          await c.query(
            `INSERT INTO intake_documents
               (tenant_id, patient_id, doc_type, original_filename,
                extracted_text, processing_status, metadata, created_by)
             VALUES ($1, $2, 'note', 'Pre-call prep brief', $3, 'complete', $4::jsonb, $5)`,
            [
              user.tenantId,
              patientId,
              JSON.stringify(brief, null, 2),
              JSON.stringify({ type: "prep_brief", ...meta }),
              user.practitionerId,
            ],
          );
        });

        await writeAudit({
          action: "analysis_generated",
          tenantId: user.tenantId,
          practitionerId: user.practitionerId,
          metadata: { patient_id: patientId, type: "prep_brief" },
        });

        send({ done: true, brief });
      } catch (err) {
        send({ error: err instanceof Error ? err.message : String(err) });
      }
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
