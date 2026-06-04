import { describe, expect, it, vi } from "vitest";

import { createEmptyIntakeData } from "@/lib/intake/schemas/intake-data.schema";

import {
  INTAKE_ISSUE_IDENTIFICATION_PROMPT_VERSION,
  analyzeIntake,
  loadIntakeIssueIdentificationPrompt,
  type AnthropicMessageResult,
  type CreateMessageFn,
} from "./analyze-intake";

const VALID_ISSUES_JSON = {
  identified_issues: [
    {
      id: "sleep_issue",
      label: "Sleep disruption",
      signal_source: "symptom",
      red_flag: false,
    },
    {
      id: "elevated_stress",
      label: "High perceived stress",
      signal_source: "lifestyle",
      red_flag: false,
    },
  ],
};

function messageWithText(text: string): AnthropicMessageResult {
  return { content: [{ type: "text", text }] };
}

describe("analyzeIntake", () => {
  it("loads the PHI-free issue-identification system prompt from disk", () => {
    const prompt = loadIntakeIssueIdentificationPrompt();
    expect(prompt).toContain("identified_issues");
    expect(prompt).not.toMatch(/\bJane\b|\bJohn\b|@/);
  });

  it("parses valid JSON and returns output with model_id and prompt_version", async () => {
    const createMessage: CreateMessageFn = vi.fn(async () =>
      messageWithText(JSON.stringify(VALID_ISSUES_JSON)),
    );

    const result = await analyzeIntake(createEmptyIntakeData(), {
      loadSystemPrompt: () => "PHI-free stub prompt",
      createMessage,
      modelId: "claude-test-model",
    });

    expect(result).not.toBeNull();
    expect(result?.output.identified_issues).toHaveLength(2);
    expect(result?.output.identified_issues[0]?.id).toBe("sleep_issue");
    expect(result?.modelId).toBe("claude-test-model");
    expect(result?.promptVersion).toBe(INTAKE_ISSUE_IDENTIFICATION_PROMPT_VERSION);
    expect(createMessage).toHaveBeenCalledTimes(1);

    const call = vi.mocked(createMessage).mock.calls[0]?.[0];
    expect(call?.messages[0]?.role).toBe("user");
    expect(call?.messages[0]?.content).toContain("about_you");
    expect(call?.system[0]?.text).toBe("PHI-free stub prompt");
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
