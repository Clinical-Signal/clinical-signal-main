import { apiAuth } from "@/lib/auth";
import { enforceCapability } from "@/lib/auth/require-role";
import { sanitizeStreamError, ERROR_CODES } from "@/lib/api-error";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  gatherPatientTimeline,
  formatTimelineForPrompt,
  runClinicalAnalysis,
  runProtocolGeneration,
  insertAnalysis,
  insertProtocol,
} from "@/lib/analysis";
import { getDocumentText, type DocumentWithMeta } from "@/lib/intake-documents";
import { recordProtocolGenerated } from "@/lib/timeline";
import { getActivePreferencesForPrompt } from "@/lib/preferences";
import { runSafetyValidation } from "@/lib/safety-validation";
import {
  generateClinicalQuestions,
  storeDialogueQuestions,
  getRelevantKnowledge,
} from "@/lib/clinical-dialogue";
import { logDebug, logError } from "@/lib/logger";
import type { ReadinessResult } from "@/lib/readiness";
import {
  assertProtocolReadinessForGeneration,
  ProtocolReadinessBlockedError,
} from "@/lib/readiness/protocol-generation-gate";

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
  if (!ok) {
    return Response.json({ error: ERROR_CODES.NOT_FOUND }, { status: 404 });
  }

  const patientId = ctx.params.id;

  let readiness: ReadinessResult;
  try {
    readiness = await assertProtocolReadinessForGeneration({
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      patientId,
    });
  } catch (err) {
    if (err instanceof ProtocolReadinessBlockedError) {
      return Response.json(
        {
          error: ERROR_CODES.VALIDATION_ERROR,
          message: err.message,
          blocking_gaps: err.result.blocking_gaps,
        },
        { status: 422 },
      );
    }
    throw err;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      try {
        send({ step: 1, total: 3, status: "Gathering patient data..." });

        const timeline = await gatherPatientTimeline(user.tenantId, patientId);

        // Fetch uploaded documents, transcripts, and practitioner notes from Intake Hub
        let docs: DocumentWithMeta[] = [];
        try {
          docs = await getDocumentText(user.tenantId, patientId);
          logDebug("generate-protocol", "Loaded", docs.length, "intake hub documents");
        } catch (docErr) {
          logError("generate-protocol", "Failed to load intake docs (non-fatal):", docErr);
        }

        send({
          step: 2,
          total: 3,
          status: "Analyzing intake and lab records...",
          detail: `${timeline.records.length} record(s), ${docs.length} document(s)`,
        });

        // Load practitioner preferences to inject into prompts
        let prefsText = "";
        try {
          prefsText = await getActivePreferencesForPrompt(user.tenantId, user.practitionerId);
        } catch (prefErr) {
          logError("generate-protocol", "Failed to load preferences (non-fatal):", prefErr);
        }

        // Load practitioner clinical knowledge from past dialogues
        let knowledgeText = "";
        try {
          // Extract systems from timeline for targeted knowledge retrieval
          const allSystems = ["hpa_axis", "gut", "thyroid", "sex_hormones",
            "blood_sugar_insulin", "detoxification", "immune_inflammatory",
            "cardiometabolic", "nutrient_status"];
          knowledgeText = await getRelevantKnowledge(user.tenantId, user.practitionerId, allSystems);
        } catch (kbErr) {
          logError("generate-protocol", "Failed to load clinical knowledge (non-fatal):", kbErr);
        }

        let timelineText = formatTimelineForPrompt(timeline, docs);
        if (prefsText) {
          timelineText += "\n\n" + prefsText;
        }
        if (knowledgeText) {
          timelineText += "\n\n" + knowledgeText;
        }
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

        const { protocol, meta: pMeta } = await runProtocolGeneration(
          findings,
          undefined,
          undefined,
          { confidenceCeiling: readiness.confidence_ceiling },
        );

        const title = (protocol.title as string) || "Draft Protocol";
        const clinicalContent = (protocol.clinical_protocol ?? {}) as Record<string, unknown>;
        const clientContent = (protocol.client_action_plan ?? {}) as Record<string, unknown>;
        (clinicalContent as Record<string, unknown>)._generation = {
          ...pMeta,
          ...(protocol.meta ? { model_meta: protocol.meta } : {}),
        };

        // Run post-generation safety validation (non-blocking for storage,
        // but we include the result in the response so the UI can show warnings)
        let safetyResult = null;
        try {
          send({ step: 3, total: 3, status: "Running safety validation..." });
          safetyResult = await runSafetyValidation(findings, protocol);
        } catch (err) {
          logError("generate-protocol", "Safety validation failed (non-fatal):", err);
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

        // Record in PatientTimeline (non-blocking)
        recordProtocolGenerated(
          user.tenantId, patientId, protocolId, user.practitionerId, title,
        ).catch((err) => logError("timeline", "Failed to record protocol generated:", err));

        // Generate clinical dialogue questions (background — don't block the response)
        (async () => {
          try {
            // Get practitioner's existing knowledge to avoid redundant questions
            const systems = ((findings.systems_analysis ?? []) as Array<Record<string, unknown>>)
              .map((s) => String(s.system ?? "")).filter(Boolean);
            const knowledge = await getRelevantKnowledge(user.tenantId, user.practitionerId, systems);
            const questions = await generateClinicalQuestions(findings, protocol, knowledge || undefined);
            if (questions.length > 0) {
              await storeDialogueQuestions(
                user.tenantId, user.practitionerId, protocolId, patientId, questions,
              );
            }
          } catch (err) {
            logError("generate-protocol", "Clinical dialogue generation failed (non-fatal):", err);
          }
        })();

        send({
          step: 3,
          total: 3,
          status: "Complete",
          done: true,
          protocolId,
          analysisId,
          safetyValidation: safetyResult
            ? { passed: safetyResult.passed, warningCount: safetyResult.warnings.length, summary: safetyResult.summary }
            : null,
          redirect: `/dashboard/patients/${patientId}/protocol/${protocolId}`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ error: sanitizeStreamError(ERROR_CODES.PROTOCOL_GENERATION_FAILED, err) });
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

