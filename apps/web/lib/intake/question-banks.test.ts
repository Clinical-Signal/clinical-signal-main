import { describe, expect, it } from "vitest";

import {
  Question,
  type ModuleKey,
} from "./schemas/question-plan.schema";
import type { DeterministicModuleKey } from "./deterministic-triggers";
import { QUESTION_BANKS, getFallbackQuestions } from "./question-banks";

const DETERMINISTIC_MODULE_KEYS: readonly DeterministicModuleKey[] = [
  "gut_deep_dive",
  "hormone_deep_dive",
  "immune_deep_dive",
  "medication_followups",
  "wellness_practice",
  "previous_labs_followups",
];

const LEGACY_DEEP_DIVE_COUNTS: Record<string, number> = {
  gut_deep_dive: 9,
  immune_deep_dive: 7,
  sleep_deep_dive: 11,
  stress_deep_dive: 13,
  skin_deep_dive: 11,
  metabolism_deep_dive: 15,
};

describe("question-banks", () => {
  it("returns a populated bank for every deterministic module key", () => {
    for (const moduleKey of DETERMINISTIC_MODULE_KEYS) {
      const bank = getFallbackQuestions(moduleKey);
      expect(bank.length).toBeGreaterThan(0);
      expect(QUESTION_BANKS[moduleKey]).toEqual(bank);
      for (const question of bank) {
        expect(question.id.length).toBeGreaterThanOrEqual(3);
        expect(question.prompt.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("legacy deep-dive fallback banks include every dashboard question", () => {
    for (const [moduleKey, expectedCount] of Object.entries(
      LEGACY_DEEP_DIVE_COUNTS,
    )) {
      const bank = getFallbackQuestions(moduleKey as ModuleKey);
      expect(bank.length).toBe(expectedCount);
      for (const question of bank) {
        expect(() => Question.parse(question)).not.toThrow();
      }
    }
  });
});
