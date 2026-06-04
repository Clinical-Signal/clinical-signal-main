import { describe, expect, it } from "vitest";

import type { DeterministicModuleKey } from "./deterministic-triggers";
import {
  MODULE_KEYS,
  Question,
  type ModuleKey,
} from "./schemas/question-plan.schema";
import {
  GUT_DEEP_DIVE_BANK,
  IMMUNE_DEEP_DIVE_BANK,
  SLEEP_DEEP_DIVE_BANK,
  STRESS_DEEP_DIVE_BANK,
} from "./question-banks-legacy-8-11";
import {
  METABOLISM_DEEP_DIVE_BANK,
  SKIN_DEEP_DIVE_BANK,
} from "./question-banks-legacy-12-13";
import { QUESTION_BANKS, getFallbackQuestions } from "./question-banks";

const DETERMINISTIC_MODULE_KEYS: readonly DeterministicModuleKey[] = [
  "gut_deep_dive",
  "hormone_deep_dive",
  "immune_deep_dive",
  "medication_followups",
  "wellness_practice",
  "previous_labs_followups",
];

describe("question-banks", () => {
  it("returns a populated bank for every deterministic module key", () => {
    for (const moduleKey of DETERMINISTIC_MODULE_KEYS) {
      const bank = getFallbackQuestions(moduleKey);
      expect(bank.length).toBeGreaterThan(0);
      expect(QUESTION_BANKS[moduleKey]).toEqual(bank);
      for (const question of bank) {
        expect(() => Question.parse(question)).not.toThrow();
        expect(question.id.length).toBeGreaterThanOrEqual(3);
        expect(question.prompt.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("returns a populated bank for every ModuleKey in the schema", () => {
    for (const moduleKey of MODULE_KEYS) {
      const bank = getFallbackQuestions(moduleKey);
      expect(bank.length).toBeGreaterThan(0);
      expect(QUESTION_BANKS[moduleKey]).toEqual(bank);
    }
  });

  it("legacy conditional banks include every dashboard deep-dive question", () => {
    expect(GUT_DEEP_DIVE_BANK).toHaveLength(9);
    expect(IMMUNE_DEEP_DIVE_BANK).toHaveLength(7);
    expect(SLEEP_DEEP_DIVE_BANK).toHaveLength(11);
    expect(STRESS_DEEP_DIVE_BANK).toHaveLength(13);
    expect(SKIN_DEEP_DIVE_BANK).toHaveLength(11);
    expect(METABOLISM_DEEP_DIVE_BANK).toHaveLength(15);

    const gutIds = GUT_DEEP_DIVE_BANK.map((q) => q.id);
    expect(gutIds).toContain("bowel_consistency");
    expect(
      GUT_DEEP_DIVE_BANK.find((q) => q.id === "bowel_consistency")?.control.kind,
    ).toBe("bristol");

    expect(
      SLEEP_DEEP_DIVE_BANK.find((q) => q.id === "caffeine_after_noon")?.control.kind,
    ).toBe("chips");
    expect(
      SKIN_DEEP_DIVE_BANK.find((q) => q.id === "stress_skin_connection")?.control.kind,
    ).toBe("chips");
    expect(
      METABOLISM_DEEP_DIVE_BANK.find((q) => q.id === "weight_goal")?.control.kind,
    ).toBe("chips");
  });

  it("covers exactly the closed module set (no extra or missing keys)", () => {
    const bankKeys = Object.keys(QUESTION_BANKS).sort();
    const schemaKeys = [...MODULE_KEYS].sort();
    expect(bankKeys).toEqual(schemaKeys);
    for (const key of schemaKeys) {
      expect(getFallbackQuestions(key as ModuleKey).length).toBeGreaterThan(0);
    }
  });
});
