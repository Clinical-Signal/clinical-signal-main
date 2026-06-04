import { describe, expect, it, vi } from "vitest";

import { createEmptyIntakeData } from "@/lib/intake/schemas/intake-data.schema";

import { buildClinicalSynthesisPayload } from "./build-clinical-synthesis-payload";
import {
  INTAKE_CLINICAL_SYNTHESIS_PROMPT_VERSION,
  loadIntakeClinicalSynthesisPrompt,
  synthesizeNote,
  type AnthropicMessageResult,
  type CreateMessageFn,
} from "./synthesize-note";

const VALID_SYNTHESIS_JSON = {
  clinical_summary: [
    "## Chief Complaint",
    "Patient reports persistent fatigue and digestive discomfort.",
    "",
    "## History of Present Illness (HPI)",
    "Symptoms began gradually over several months with variable bowel habits.",
    "",
    "## Review of Systems (ROS)",
    "- GI: Positive for bloating; negative for hematochezia per intake.",
    "- Constitutional: Reports low energy.",
  ].join("\n"),
  suggested_next_steps: [
    {
      id: "review_gi_module",
      label: "Review detailed GI deep-dive answers at visit",
      category: "follow_up",
      priority: "high",
      rationale: "Digestive symptoms flagged at baseline with follow-up responses recorded.",
    },
    {
      id: "baseline_labs",
      label: "Consider foundational metabolic and inflammatory labs",
      category: "labs",
      priority: "medium",
      rationale: "Broad symptom pattern warrants objective baseline data.",
    },
    {
      id: "sleep_hygiene",
      label: "Discuss sleep hygiene and timing",
      category: "lifestyle",
      priority: "medium",
      rationale: "Fatigue may relate to unassessed sleep factors from intake.",
    },
  ],
};

function messageWithText(text: string): AnthropicMessageResult {
  return { content: [{ type: "text", text }] };
}

describe("synthesizeNote", () => {
  it("loads the PHI-free clinical synthesis system prompt from disk", () => {
    const prompt = loadIntakeClinicalSynthesisPrompt();
    expect(prompt).toContain("medical scribe");
    expect(prompt).toContain("clinical_summary");
    expect(prompt).toContain("suggested_next_steps");
    expect(prompt).toContain("Chief Complaint");
    expect(prompt).not.toMatch(/\bJane\b|\bJohn\b|patient@/i);
  });

  it("parses valid JSON and returns output with model_id and prompt_version", async () => {
    const createMessage: CreateMessageFn = vi.fn(async () =>
      messageWithText(JSON.stringify(VALID_SYNTHESIS_JSON)),
    );

    const result = await synthesizeNote(createEmptyIntakeData(), {
      loadSystemPrompt: () => "PHI-free stub prompt",
      createMessage,
      modelId: "claude-test-model",
    });

    expect(result).not.toBeNull();
    expect(result?.output.clinical_summary).toContain("## Chief Complaint");
    expect(result?.output.suggested_next_steps).toHaveLength(3);
    expect(result?.output.suggested_next_steps[0]?.id).toBe("review_gi_module");
    expect(result?.modelId).toBe("claude-test-model");
    expect(result?.promptVersion).toBe(INTAKE_CLINICAL_SYNTHESIS_PROMPT_VERSION);
    expect(createMessage).toHaveBeenCalledTimes(1);

    const call = vi.mocked(createMessage).mock.calls[0]?.[0];
    expect(call?.messages[0]?.role).toBe("user");
    expect(call?.messages[0]?.content).toContain("step_one");
    expect(call?.system[0]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("parses JSON wrapped in markdown code fences", async () => {
    const createMessage: CreateMessageFn = vi.fn(async () =>
      messageWithText(
        `\`\`\`json\n${JSON.stringify(VALID_SYNTHESIS_JSON)}\n\`\`\``,
      ),
    );

    const result = await synthesizeNote(createEmptyIntakeData(), {
      loadSystemPrompt: () => "PHI-free stub prompt",
      createMessage,
      modelId: "claude-test-model",
    });

    expect(result).not.toBeNull();
    expect(result?.output.suggested_next_steps).toHaveLength(3);
  });

  it("returns null when JSON is missing required clinical_summary headings", async () => {
    const invalid = {
      ...VALID_SYNTHESIS_JSON,
      clinical_summary: "No section headings here.",
    };
    const createMessage: CreateMessageFn = vi.fn(async () =>
      messageWithText(JSON.stringify(invalid)),
    );

    const result = await synthesizeNote(createEmptyIntakeData(), {
      loadSystemPrompt: () => "PHI-free stub prompt",
      createMessage,
      modelId: "claude-test-model",
    });

    expect(result).toBeNull();
    expect(createMessage).toHaveBeenCalledTimes(2);
  });

  it("returns null after two unparseable responses", async () => {
    const createMessage: CreateMessageFn = vi.fn(async () =>
      messageWithText("not-json-at-all"),
    );

    const result = await synthesizeNote(createEmptyIntakeData(), {
      loadSystemPrompt: () => "PHI-free stub prompt",
      createMessage,
      modelId: "claude-test-model",
    });

    expect(result).toBeNull();
    expect(createMessage).toHaveBeenCalledTimes(2);
  });
});

describe("buildClinicalSynthesisPayload", () => {
  it("includes step_one and empty step_two when plan is absent", () => {
    const payload = buildClinicalSynthesisPayload(createEmptyIntakeData());

    expect(payload.step_one.about_you.full_name).toBe("");
    expect(payload.identified_issues).toEqual([]);
    expect(payload.step_two_modules).toEqual([]);
    expect(payload.analysis_degraded).toBe(false);
  });
});
