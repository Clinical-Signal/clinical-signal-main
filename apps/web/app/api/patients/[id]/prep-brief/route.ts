import { apiAuth } from "@/lib/auth";
import { sanitizeStreamError, ERROR_CODES } from "@/lib/api-error";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  gatherPatientTimeline,
  generatePrepBrief,
} from "@/lib/analysis";
import {
  countIntakeDocsAfter,
  getDocumentText,
  getLatestPrepBrief,
  insertPrepBriefDocument,
  type DocumentWithMeta,
} from "@/lib/intake-documents";
import { getActivePreferencesForPrompt } from "@/lib/preferences";

export const maxDuration = 300;

/** Return the most recently generated prep brief for this patient, if one exists. */
export async function GET(
  _req: Request,
  ctx: { params: { id: string } },
) {
  const user = await apiAuth();
  if (!user) return Response.json({ error: ERROR_CODES.NOT_AUTHENTICATED }, { status: 401 });
  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return Response.json({ error: ERROR_CODES.NOT_FOUND }, { status: 404 });

  const result = await getLatestPrepBrief(user.tenantId, ctx.params.id);

  if (!result) {
    return Response.json({ exists: false });
  }

  let brief: Record<string, unknown> = {};
  try {
    brief = JSON.parse(result.extractedText);
  } catch {
    brief = {};
  }

  const newerDocs = await countIntakeDocsAfter(
    user.tenantId,
    ctx.params.id,
    result.createdAt,
  );

  return Response.json({
    exists: true,
    brief,
    generatedAt: result.createdAt,
    meta: result.metadata,
    newDocsSinceGeneration: newerDocs,
  });
}

export async function POST(
  _req: Request,
  ctx: { params: { id: string } },
) {
  const user = await apiAuth();
  if (!user) return Response.json({ error: ERROR_CODES.NOT_AUTHENTICATED }, { status: 401 });
  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return Response.json({ error: ERROR_CODES.NOT_FOUND }, { status: 404 });

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

        let docs: DocumentWithMeta[] = [];
        try {
          docs = await getDocumentText(user.tenantId, patientId);
        } catch { /* non-fatal */ }

        send({
          status: "Generating prep brief...",
          detail: `${timeline.records.length} records, ${docs.length} documents`,
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

        if (docs.length > 0) {
          sections.push("\n## Uploaded documents & transcripts (" + docs.length + ")");
          sections.push(
            "Source types are labeled in brackets. " +
            "[Practitioner Note] and [Call Transcript] carry higher authority than structured intake."
          );
          const docTypeLabels: Record<string, string> = {
            transcript: "Call Transcript",
            note: "Practitioner Note",
            pdf: "Uploaded PDF",
            image: "Uploaded Image",
            docx: "Uploaded Document",
            txt: "Uploaded Document",
          };
          for (let i = 0; i < docs.length; i++) {
            const doc = docs[i]!;
            let label = docTypeLabels[doc.docType] ?? "Uploaded Document";
            // Identify lab PDFs by filename
            if (doc.docType === "pdf" && doc.filename) {
              const fn = doc.filename.toLowerCase();
              if (fn.includes("gi-map") || fn.includes("gimap")) label = "Lab Report — GI-MAP";
              else if (fn.includes("dutch")) label = "Lab Report — DUTCH";
              else if (fn.includes("nutraeval")) label = "Lab Report — NutraEval";
              else if (fn.includes("lab") || fn.includes("blood") || fn.includes("panel")) label = "Lab Report (PDF)";
            }
            const nameNote = doc.filename ? ` (${doc.filename})` : "";
            sections.push(`\n### [${label}] Document ${i + 1}${nameNote}`);
            sections.push(doc.text.length > 8000 ? doc.text.slice(0, 8000) + "\n...(truncated)" : doc.text);
          }
        }

        // Include practitioner preferences for style/approach context
        try {
          const prefsText = await getActivePreferencesForPrompt(user.tenantId, user.practitionerId);
          if (prefsText) {
            sections.push("\n" + prefsText);
          }
        } catch { /* non-fatal */ }

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

        await insertPrepBriefDocument({
          tenantId: user.tenantId,
          patientId,
          practitionerId: user.practitionerId,
          briefJson: JSON.stringify(brief, null, 2),
          metadata: { type: "prep_brief", ...meta },
        });

        await writeAudit({
          action: "analysis_generated",
          tenantId: user.tenantId,
          practitionerId: user.practitionerId,
          metadata: { patient_id: patientId, type: "prep_brief" },
        });

        send({ done: true, brief });
      } catch (err) {
        send({ error: sanitizeStreamError(ERROR_CODES.BRIEF_GENERATION_FAILED, err) });
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
