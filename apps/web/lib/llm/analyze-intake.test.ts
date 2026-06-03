import { describe, expect, it, vi } from "vitest";

import { createEmptyIntakeData } from "@/lib/intake/schemas/intake-data.schema";

import {
  INTAKE_DYNAMIC_QUESTIONS_PROMPT_VERSION,
  analyzeIntake,
  type AnthropicMessageResult,
  type CreateMessageFn,
} from "./analyze-intake";

const VALID_PLAN_JSON = {
  identified_issues: [
    {
      id: "sleep_issue",
      label: "Sleep disruption",
      signal_source: "symptom",
      red_flag: false,
    },
  ],
  question_plan: [
    {
      module_key: "sleep_deep_dive",
      rationale: "Sleep disruption noted in intake.",
      questions: [
        {
          id: "sleep_onset",
          prompt: "How long does it take you to fall asleep?",
          control: {
            kind: "chips",
            multi: false,
            options: [
              { value: "under_15", label: "Under 15 min" },
              { value: "15_30", label: "15–30 min" },
            ],
          },
          priority: "must_have",
          required: true,
        },
      ],
    },
  ],
};

function messageWithText(text: string): AnthropicMessageResult {
  return { content: [{ type: "text", text }] };
}

describe("analyzeIntake", () => {
  it("parses valid JSON and returns plan with model_id and prompt_version", async () => {
    const createMessage: CreateMessageFn = vi.fn(async () =>
      messageWithText(JSON.stringify(VALID_PLAN_JSON)),
    );

    const result = await analyzeIntake(createEmptyIntakeData(), {
      loadSystemPrompt: () => "PHI-free stub prompt",
      createMessage,
      modelId: "claude-test-model",
    });

    expect(result).not.toBeNull();
    expect(result?.plan.identified_issues).toHaveLength(1);
    expect(result?.plan.question_plan[0]?.module_key).toBe("sleep_deep_dive");
    expect(result?.modelId).toBe("claude-test-model");
    expect(result?.promptVersion).toBe(INTAKE_DYNAMIC_QUESTIONS_PROMPT_VERSION);
    expect(createMessage).toHaveBeenCalledTimes(1);

    const call = vi.mocked(createMessage).mock.calls[0]?.[0];
    expect(call?.messages[0]?.role).toBe("user");
    expect(call?.messages[0]?.content).toContain("about_you");
    expect(call?.system[0]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("returns null after two unparseable responses", async () => {
    const createMessage: CreateMessageFn = vi.fn(async () =>
      messageWithText("not-json-at-all"),
    );

    const result = await analyzeIntake(createEmptyIntakeData(), {
      loadSystemPrompt: () => "PHI-free stub prompt",
      createMessage,
      modelId: "claude-test-model",
    });

    expect(result).toBeNull();
    expect(createMessage).toHaveBeenCalledTimes(2);
  });
});
