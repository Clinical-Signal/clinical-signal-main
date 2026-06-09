import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAudit } from "@/lib/audit/write-audit";
import { mergeIntakeData } from "@/lib/intake/merge-intake";
import {
  getPatientIntakeState,
  savePatientIntakeData,
} from "@/lib/intake/patient-intake-store";
import { setPatientIntakeStatus } from "@/lib/intake/set-patient-intake-status";
import {
  STEP_TWO_ANSWERS_KEY,
  STEP_TWO_PLAN_KEY,
  STEP_TWO_SYNTHESIS_KEY,
} from "@/lib/intake/step-two-storage";
import {
  AboutYouSchema,
  AnythingElseSchema,
  HistorySchema,
  HormonesSchema,
  LifestyleSchema,
  MedicationsSchema,
  PreviousLabsSchema,
  SymptomsSchema,
  WearablesSchema,
  WhyHereSchema,
} from "@/lib/intake/schemas/step-one.schema";
import { extractClientIp, tokenErrorResponse } from "@/lib/tokens/intake-token-api";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

const SECTION_KEYS = [
  "about_you",
  "why_here",
  "symptoms",
  "history",
  "medications",
  "lifestyle",
  "hormones",
  "previous_labs",
  "wearables",
  "anything_else",
  "step_two",
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

const STEP_ONE_SECTIONS = new Set<SectionKey>([
  "about_you",
  "why_here",
  "symptoms",
  "history",
  "medications",
  "lifestyle",
  "hormones",
  "previous_labs",
  "wearables",
  "anything_else",
]);

const StepTwoSectionSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});

const SectionAutosaveBodySchema = z.object({
  section: z.enum(SECTION_KEYS),
  data: z.unknown(),
});

function parseSectionData(
  section: SectionKey,
  data: unknown,
  existingStepTwo: Record<string, unknown> | undefined,
) {
  switch (section) {
    case "about_you":
      return { about_you: AboutYouSchema.parse(data) };
    case "why_here":
      return { why_here: WhyHereSchema.parse(data) };
    case "symptoms":
      return { symptoms: SymptomsSchema.parse(data) };
    case "history":
      return { history: HistorySchema.parse(data) };
    case "medications":
      return { medications: MedicationsSchema.parse(data) };
    case "lifestyle":
      return { lifestyle: LifestyleSchema.parse(data) };
    case "hormones":
      return { hormones: HormonesSchema.parse(data) };
    case "previous_labs":
      return { previous_labs: PreviousLabsSchema.parse(data) };
    case "wearables":
      return { wearables: WearablesSchema.parse(data) };
    case "anything_else":
      return { anything_else: AnythingElseSchema.parse(data) };
    case "step_two": {
      const parsed = StepTwoSectionSchema.parse(data);
      const priorPlan = existingStepTwo?.[STEP_TWO_PLAN_KEY];
      const priorSynthesis = existingStepTwo?.[STEP_TWO_SYNTHESIS_KEY];
      return {
        step_two: {
          ...(existingStepTwo ?? {}),
          ...(priorPlan !== undefined ? { [STEP_TWO_PLAN_KEY]: priorPlan } : {}),
          ...(priorSynthesis !== undefined
            ? { [STEP_TWO_SYNTHESIS_KEY]: priorSynthesis }
            : {}),
          [STEP_TWO_ANSWERS_KEY]: parsed.answers,
        },
      };
    }
  }
}

export async function POST(
  request: Request,
  ctx: { params: { token: string } },
): Promise<Response> {
  const rawToken = ctx.params.token;
  if (!rawToken) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const parsedBody = SectionAutosaveBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const verified = await getIntakeTokenService().verify({
      rawToken,
      clientIp: extractClientIp(request),
    });

    const existing = await getPatientIntakeState(verified.tenantId, verified.patientId);
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    let sectionPayload;
    try {
      sectionPayload = parseSectionData(
        parsedBody.data.section,
        parsedBody.data.data,
        existing.intakeData.step_two,
      );
    } catch {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }

    const merged = mergeIntakeData(existing.intakeData, sectionPayload, "patient");
    const { savedAt } = await savePatientIntakeData(
      verified.tenantId,
      verified.patientId,
      merged,
    );

    let intakeStatus = existing.intakeStatus;
    if (
      STEP_ONE_SECTIONS.has(parsedBody.data.section) &&
      existing.intakeStatus === "not_started"
    ) {
      await setPatientIntakeStatus(verified.tenantId, verified.patientId, "step1_complete");
      intakeStatus = "step1_complete";
    }

    await writeAudit({
      tenantId: verified.tenantId,
      actorId: null,
      action: "intake_section_saved",
      entity: "patient",
      entityId: verified.patientId,
      payload: {
        tokenId: verified.tokenId,
        section: parsedBody.data.section,
      },
    });

    return NextResponse.json({
      savedAt,
      section: parsedBody.data.section,
      intakeStatus,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }

    return tokenErrorResponse(error);
  }
}
