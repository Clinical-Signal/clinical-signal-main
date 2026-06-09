import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseLlmJson } from "./parse-llm-json";

describe("parseLlmJson", () => {
  it("parses JSON wrapped in markdown fences", () => {
    const raw = '```json\n{"isSignificantChange": false, "reason": "typo"}\n```';
    const result = parseLlmJson(
      raw,
      z.object({ isSignificantChange: z.boolean(), reason: z.string() }),
    );
    expect(result.isSignificantChange).toBe(false);
    expect(result.reason).toBe("typo");
  });
});
