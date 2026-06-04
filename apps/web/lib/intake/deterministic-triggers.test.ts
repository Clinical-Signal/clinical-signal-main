/**
 * Deterministic Triggers — Phase 2 TDD scaffold.
 * Matrix: docs/architecture/phase-2-test-matrix.md §5 (DT-01–DT-17), inputs §0.4.
 */
import { describe, expect, it } from "vitest";
import {
  getDeterministicTriggers,
  type DeterministicModuleKey,
  type StepOneTriggerInput,
} from "./deterministic-triggers";

/** §0.4 baseline — all signals absent (empty / false / null). */
const EMPTY_STEP_ONE: StepOneTriggerInput = {
  digestive_symptoms: false,
  hormonal_symptoms: false,
  autoimmune: false,
  medications: null,
  sauna: false,
  cold_exposure: false,
  meditation: false,
  prior_labs: false,
};

function stepOneInput(
  overrides: Partial<StepOneTriggerInput>,
): StepOneTriggerInput {
  return { ...EMPTY_STEP_ONE, ...overrides };
}

type SignalAbbrev = "dig" | "hor" | "aut" | "sau" | "cld" | "mdt" | "lab";

/** Builds Step-1 trigger input from §0.4 abbreviations (listed order is not output order). */
function buildStepOneFromSignals(
  signals: readonly SignalAbbrev[],
): StepOneTriggerInput {
  const input = stepOneInput({});

  for (const signal of signals) {
    switch (signal) {
      case "dig":
        input.digestive_symptoms = true;
        break;
      case "hor":
        input.hormonal_symptoms = true;
        break;
      case "aut":
        input.autoimmune = true;
        break;
      case "sau":
        input.sauna = true;
        break;
      case "cld":
        input.cold_exposure = true;
        break;
      case "mdt":
        input.meditation = true;
        break;
      case "lab":
        input.prior_labs = true;
        break;
      default: {
        const _exhaustive: never = signal;
        throw new Error(`Unknown signal abbreviation: ${_exhaustive}`);
      }
    }
  }

  return input;
}

function expectModules(
  input: StepOneTriggerInput,
  expected: DeterministicModuleKey[],
): void {
  expect(getDeterministicTriggers(input)).toEqual(expected);
}

describe("deterministic triggers (PRD §5.2)", () => {
  describe("§5.1 single-signal triggers", () => {
    it("DT-01", () => {
      expectModules(EMPTY_STEP_ONE, []);
    });

    it("DT-02", () => {
      expectModules(buildStepOneFromSignals(["dig"]), ["gut_deep_dive"]);
    });

    it("DT-03", () => {
      expectModules(buildStepOneFromSignals(["hor"]), ["hormone_deep_dive"]);
    });

    it("DT-04", () => {
      expectModules(buildStepOneFromSignals(["aut"]), ["immune_deep_dive"]);
    });

    it("DT-05", () => {
      expectModules(
        stepOneInput({ medications: ["metformin"] }),
        ["medication_followups"],
      );
    });

    it("DT-06", () => {
      expectModules(buildStepOneFromSignals(["sau"]), ["wellness_practice"]);
    });

    it("DT-07", () => {
      expectModules(buildStepOneFromSignals(["lab"]), [
        "previous_labs_followups",
      ]);
    });
  });

  describe("§5.2 wellness-practice de-duplication", () => {
    it("DT-08", () => {
      expectModules(buildStepOneFromSignals(["cld"]), ["wellness_practice"]);
    });

    it("DT-09", () => {
      expectModules(buildStepOneFromSignals(["mdt"]), ["wellness_practice"]);
    });

    it("DT-10", () => {
      expectModules(buildStepOneFromSignals(["sau", "cld", "mdt"]), [
        "wellness_practice",
      ]);
    });
  });

  describe("§5.3 medication edge cases", () => {
    it("DT-11", () => {
      expectModules(stepOneInput({ medications: [] }), []);
    });

    it("DT-12", () => {
      expectModules(stepOneInput({ medications: [""] }), []);
    });

    it("DT-13", () => {
      expectModules(stepOneInput({ medications: ["   "] }), []);
    });

    it("DT-14", () => {
      expectModules(stepOneInput({ medications: ["", "metformin", " "] }), [
        "medication_followups",
      ]);
    });
  });

  describe("§5.4 combinations and order stability", () => {
    it("DT-15", () => {
      expectModules(buildStepOneFromSignals(["dig", "hor"]), [
        "gut_deep_dive",
        "hormone_deep_dive",
      ]);
    });

    it("DT-16", () => {
      expectModules(buildStepOneFromSignals(["hor", "dig"]), [
        "gut_deep_dive",
        "hormone_deep_dive",
      ]);
    });

    it("DT-17", () => {
      expectModules(
        stepOneInput({
          digestive_symptoms: true,
          hormonal_symptoms: true,
          autoimmune: true,
          medications: ["x"],
          sauna: true,
          prior_labs: true,
        }),
        [
          "gut_deep_dive",
          "hormone_deep_dive",
          "immune_deep_dive",
          "medication_followups",
          "wellness_practice",
          "previous_labs_followups",
        ],
      );
    });
  });
});
