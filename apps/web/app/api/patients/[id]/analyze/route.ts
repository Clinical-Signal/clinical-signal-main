import { apiAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  gatherPatientTimeline,
  runClinicalAnalysis,
  insertAnalysis,
} from "@/lib/analysis";
import { getDocumentText } from "@/lib/intake-documents";

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

        // Fetch uploaded documents, transcripts, and practitioner notes from Intake Hub
        let docTexts: string[] = [];
        try {
          docTexts = await getDocumentText(user.tenantId, patientId);
          console.log("[analyze] Loaded", docTexts.length, "intake hub documents at", elapsed());
        } catch (docErr) {
          console.error("[analyze] Failed to load intake docs (non-fatal):", docErr);
        }

        send({
          status: "Analyzing intake and lab records...",
          detail: `${timeline.records.length} record(s), ${docTexts.length} document(s)`,
        });

        const timelineText = formatTimeline(timeline, docTexts);

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

const DOC_TEXT_CAP = parseInt(process.env.DOC_TEXT_CAP ?? "4000", 10);

function formatTimeline(
  t: {
    intakeData: Record<string, unknown>;
    records: Array<{
      recordId: string;
      recordType: string;
      recordDate: string | null;
      structuredData: Record<string, unknown>;
    }>;
  },
  documentTexts?: string[],
): string {
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

  if (documentTexts && documentTexts.length > 0) {
    sections.push("\n## Uploaded documents & transcripts (" + documentTexts.length + ")");
    sections.push(
      "The following are practitioner-uploaded call transcripts, clinical notes, " +
      "and extracted document text (including lab reports like GI-MAP, DUTCH, NutraEval). " +
      "They contain direct clinical observations and data that MUST inform the analysis. " +
      "If a lab test appears here, do NOT recommend ordering that test — it has already been done."
    );
    for (let i = 0; i < documentTexts.length; i++) {
      const text = documentTexts[i]!;
      sections.push("\n### Document " + (i + 1));
      sections.push(text.length > DOC_TEXT_CAP ? text.slice(0, DOC_TEXT_CAP) + "\n...(truncated)" : text);
    }
  }

  return sections.join("\n");
}
