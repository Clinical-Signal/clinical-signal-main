import { describe, expect, it } from "vitest";
import { z } from "zod";

import { FRICTION_BUDGET_DEFAULTS } from "../constants";
import {
  QuestionPlanLLMOutput,
  QuestionPlanResolved,
  type Question,
  type QuestionPlanLLMOutput as QuestionPlanLLMOutputType,
  type QuestionPlanResolved as QuestionPlanResolvedType,
} from "./question-plan.schema";

function yesNoQuestion(
  id: string,
  prompt = "Do you experience this symptom?",
  overrides: Partial<Question> = {},
): Question {
  return {
    id,
    prompt,
    control: { kind: "yes_no" },
    priority: "must_have",
    required: true,
    ...overrides,
  };
}

function modulePlan(
  moduleKey: QuestionPlanLLMOutputType["question_plan"][number]["module_key"],
  questions: Question[],
  rationale = "Clinically relevant follow-up based on Step-1 signals.",
) {
  return {
    module_key: moduleKey,
    rationale,
    questions,
  };
}

function identifiedIssue(
  id: string,
  label: string,
  signalSource: QuestionPlanLLMOutputType["identified_issues"][number]["signal_source"],
  redFlag = false,
) {
  return {
    id,
    label,
    signal_source: signalSource,
    red_flag: redFlag,
  };
}

function buildValidResolvedPlan(
  overrides: Partial<QuestionPlanResolvedType> = {},
): QuestionPlanResolvedType {
  return {
    identified_issues: [],
    question_plan: [
      {
        module_key: "gut_deep_dive",
        rationale: "Digestive symptoms require structured follow-up.",
        questions: [yesNoQuestion("bloating")],
        is_deterministic: true,
        was_budget_suppressed: false,
        questions_trimmed_count: 0,
      },
    ],
    red_flag_triggered: false,
    friction_budget_report: {
      deterministic_module_count: 1,
      augmented_module_count: 0,
      augmented_modules_suppressed: [],
      questions_trimmed: [],
      budget_applied: { ...FRICTION_BUDGET_DEFAULTS },
    },
    analysis_degraded: false,
    model_id: "claude-sonnet-4-5",
    prompt_version: "intake_dynamic_questions_v1",
    ...overrides,
  };
}

function expectParseSuccess<T>(
  schema: z.ZodType<T>,
  value: unknown,
): T {
  const result = schema.safeParse(value);
  expect(result.success).toBe(true);
  if (!result.success) {
    throw new Error(JSON.stringify(result.error.issues, null, 2));
  }
  return result.data;
}

function expectParseFailure(
  schema: z.ZodType,
  value: unknown,
  expectedPath?: Array<string | number>,
): void {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  if (!result.success && expectedPath) {
    expect(
      result.error.issues.some((issue) =>
        pathsEqual(issue.path, expectedPath),
      ),
    ).toBe(true);
  }
}

function pathsEqual(
  actual: PropertyKey[],
  expected: Array<string | number>,
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((segment, index) => segment === expected[index])
  );
}

function expectRoundTrip<T>(schema: z.ZodType<T>, fixture: unknown): void {
  const first = expectParseSuccess(schema, fixture);
  const second = expectParseSuccess(schema, first);
  expect(second).toEqual(first);
}

const POSITIVE_FIXTURES = {
  empty_plan: {
    identified_issues: [],
    question_plan: [],
  },
  single_deterministic: {
    identified_issues: [
      identifiedIssue("digestive_discomfort", "Digestive discomfort", "symptom"),
    ],
    question_plan: [
      modulePlan("gut_deep_dive", [
        yesNoQuestion("bloating"),
        yesNoQuestion("reflux"),
        yesNoQuestion("bowel_changes"),
      ]),
    ],
  },
  multiple_deterministic: {
    identified_issues: [
      identifiedIssue("digestive_discomfort", "Digestive discomfort", "symptom"),
      identifiedIssue("hormonal_imbalance", "Hormonal imbalance", "symptom"),
      identifiedIssue("medication_gaps", "Medication detail gaps", "medication"),
    ],
    question_plan: [
      modulePlan("gut_deep_dive", [yesNoQuestion("bloating")]),
      modulePlan("hormone_deep_dive", [yesNoQuestion("cycle_changes")]),
      modulePlan("medication_followups", [yesNoQuestion("med_dose_known")]),
    ],
  },
  with_red_flags: {
    identified_issues: [
      identifiedIssue("chest_pain_signal", "Chest pain reported", "symptom", true),
    ],
    question_plan: [modulePlan("stress_deep_dive", [yesNoQuestion("stress_level")])],
    red_flag_screening: [
      yesNoQuestion("chest_pain_present", "Are you having chest pain now?"),
      yesNoQuestion("radiating_pain", "Is the pain radiating?"),
    ],
  },
  augmented_at_budget: {
    identified_issues: [
      identifiedIssue("sleep_issue", "Sleep disruption", "symptom"),
      identifiedIssue("stress_issue", "High stress load", "symptom"),
      identifiedIssue("wellness_gap", "Wellness practice gaps", "lifestyle"),
      identifiedIssue("lab_gap", "Prior labs not reviewed", "history"),
    ],
    question_plan: [
      modulePlan(
        "sleep_deep_dive",
        Array.from({ length: 6 }, (_, index) =>
          yesNoQuestion(`sleep_q_${index}`, `Sleep question ${index + 1}?`),
        ),
      ),
      modulePlan(
        "stress_deep_dive",
        Array.from({ length: 6 }, (_, index) =>
          yesNoQuestion(`stress_q_${index}`, `Stress question ${index + 1}?`),
        ),
      ),
      modulePlan(
        "wellness_practice",
        Array.from({ length: 6 }, (_, index) =>
          yesNoQuestion(`wellness_q_${index}`, `Wellness question ${index + 1}?`),
        ),
      ),
      modulePlan(
        "previous_labs_followups",
        Array.from({ length: 6 }, (_, index) =>
          yesNoQuestion(`labs_q_${index}`, `Labs question ${index + 1}?`),
        ),
      ),
    ],
  },
  with_help_text: {
    identified_issues: [
      identifiedIssue("digestive_discomfort", "Digestive discomfort", "symptom"),
    ],
    question_plan: [
      modulePlan("gut_deep_dive", [
        yesNoQuestion("bloating", "Do you experience bloating?", {
          help_text: "Include symptoms after meals or overnight.",
        }),
      ]),
    ],
  },
  all_control_kinds: {
    identified_issues: [
      identifiedIssue("multi_control_demo", "Control kind coverage", "symptom"),
    ],
    question_plan: [
      modulePlan("gut_deep_dive", [
        {
          id: "chips_demo",
          prompt: "Which symptoms apply?",
          control: {
            kind: "chips",
            multi: true,
            options: [
              { value: "bloat", label: "Bloating" },
              { value: "pain", label: "Pain" },
            ],
          },
          priority: "must_have",
          required: true,
        },
        {
          id: "slider_demo",
          prompt: "Rate your symptom severity.",
          control: {
            kind: "slider",
            min: 0,
            max: 10,
            step: 1,
            unit: "/10",
          },
          priority: "must_have",
          required: true,
        },
        {
          id: "free_text_demo",
          prompt: "Describe your symptoms.",
          control: {
            kind: "free_text",
            multiline: true,
            max_chars: 200,
          },
          priority: "nice_to_have",
          required: false,
        },
        {
          id: "bristol_demo",
          prompt: "Select your typical stool type.",
          control: { kind: "bristol" },
          priority: "must_have",
          required: true,
        },
        yesNoQuestion("yes_no_demo", "Do symptoms occur daily?"),
        {
          id: "numeric_demo",
          prompt: "How many episodes per week?",
          control: {
            kind: "numeric",
            min: 0,
            max: 21,
            unit: "episodes",
          },
          priority: "nice_to_have",
          required: false,
        },
      ]),
    ],
  },
} as const satisfies Record<string, QuestionPlanLLMOutputType>;

describe("question-plan.schema", () => {
  describe("QuestionPlanLLMOutput positive fixtures", () => {
    for (const [name, fixture] of Object.entries(POSITIVE_FIXTURES)) {
      it(`accepts ${name}`, () => {
        expectParseSuccess(QuestionPlanLLMOutput, fixture);
      });

      it(`round-trips ${name}`, () => {
        expectRoundTrip(QuestionPlanLLMOutput, fixture);
      });
    }
  });

  describe("QuestionPlanLLMOutput negative fixtures", () => {
    it("unknown_module_key", () => {
      expectParseFailure(
        QuestionPlanLLMOutput,
        {
          identified_issues: [],
          question_plan: [
            {
              module_key: "custom_module",
              rationale: "Invalid custom module key.",
              questions: [],
            },
          ],
        },
        ["question_plan", 0, "module_key"],
      );
    });

    it("unknown_control_kind", () => {
      expectParseFailure(
        QuestionPlanLLMOutput,
        {
          identified_issues: [],
          question_plan: [
            modulePlan("gut_deep_dive", [
              {
                id: "bad_control",
                prompt: "Invalid control kind?",
                control: { kind: "dropdown" },
                priority: "must_have",
                required: true,
              },
            ]),
          ],
        },
        ["question_plan", 0, "questions", 0, "control", "kind"],
      );
    });

    it("chips_one_option", () => {
      expectParseFailure(
        QuestionPlanLLMOutput,
        {
          identified_issues: [],
          question_plan: [
            modulePlan("gut_deep_dive", [
              {
                id: "chips_one",
                prompt: "Pick one option only?",
                control: {
                  kind: "chips",
                  multi: false,
                  options: [{ value: "only", label: "Only option" }],
                },
                priority: "must_have",
                required: true,
              },
            ]),
          ],
        },
        ["question_plan", 0, "questions", 0, "control", "options"],
      );
    });

    it("free_text_zero_chars", () => {
      expectParseFailure(
        QuestionPlanLLMOutput,
        {
          identified_issues: [],
          question_plan: [
            modulePlan("gut_deep_dive", [
              {
                id: "free_text_zero",
                prompt: "Tell us more?",
                control: {
                  kind: "free_text",
                  multiline: true,
                  max_chars: 0,
                },
                priority: "must_have",
                required: true,
              },
            ]),
          ],
        },
        ["question_plan", 0, "questions", 0, "control", "max_chars"],
      );
    });

    it("prompt_empty", () => {
      expectParseFailure(
        QuestionPlanLLMOutput,
        {
          identified_issues: [],
          question_plan: [
            modulePlan("gut_deep_dive", [
              {
                id: "empty_prompt",
                prompt: "",
                control: { kind: "yes_no" },
                priority: "must_have",
                required: true,
              },
            ]),
          ],
        },
        ["question_plan", 0, "questions", 0, "prompt"],
      );
    });

    it("prompt_too_long", () => {
      expectParseFailure(
        QuestionPlanLLMOutput,
        {
          identified_issues: [],
          question_plan: [
            modulePlan("gut_deep_dive", [
              {
                id: "long_prompt",
                prompt: "a".repeat(281),
                control: { kind: "yes_no" },
                priority: "must_have",
                required: true,
              },
            ]),
          ],
        },
        ["question_plan", 0, "questions", 0, "prompt"],
      );
    });

    it("id_with_spaces", () => {
      expectParseFailure(
        QuestionPlanLLMOutput,
        {
          identified_issues: [],
          question_plan: [
            modulePlan("gut_deep_dive", [
              {
                id: "bowel frequency",
                prompt: "How often?",
                control: { kind: "yes_no" },
                priority: "must_have",
                required: true,
              },
            ]),
          ],
        },
        ["question_plan", 0, "questions", 0, "id"],
      );
    });

    it("id_starting_with_digit", () => {
      expectParseFailure(
        QuestionPlanLLMOutput,
        {
          identified_issues: [],
          question_plan: [
            modulePlan("gut_deep_dive", [
              {
                id: "1_question",
                prompt: "How often?",
                control: { kind: "yes_no" },
                priority: "must_have",
                required: true,
              },
            ]),
          ],
        },
        ["question_plan", 0, "questions", 0, "id"],
      );
    });

    it("duplicate_module_key", () => {
      const duplicateModule = modulePlan("gut_deep_dive", [
        yesNoQuestion("bloating"),
      ]);
      expectParseFailure(QuestionPlanLLMOutput, {
        identified_issues: [],
        question_plan: [duplicateModule, duplicateModule],
      });
    });

    it("duplicate_question_id_within_module", () => {
      expectParseFailure(QuestionPlanLLMOutput, {
        identified_issues: [],
        question_plan: [
          modulePlan("gut_deep_dive", [
            yesNoQuestion("frequency"),
            yesNoQuestion("frequency"),
          ]),
        ],
      });
    });

    it("twenty_one_issues", () => {
      expectParseFailure(
        QuestionPlanLLMOutput,
        {
          identified_issues: Array.from({ length: 21 }, (_, index) =>
            identifiedIssue(`issue_${index}`, `Issue ${index}`, "symptom"),
          ),
          question_plan: [],
        },
        ["identified_issues"],
      );
    });

    it("slider_max_le_min", () => {
      expectParseFailure(
        QuestionPlanLLMOutput,
        {
          identified_issues: [],
          question_plan: [
            modulePlan("gut_deep_dive", [
              {
                id: "bad_slider",
                prompt: "Rate severity?",
                control: {
                  kind: "slider",
                  min: 10,
                  max: 5,
                  step: 1,
                },
                priority: "must_have",
                required: true,
              },
            ]),
          ],
        },
      );
    });

    it("twenty_one_questions_per_module", () => {
      expectParseFailure(
        QuestionPlanLLMOutput,
        {
          identified_issues: [],
          question_plan: [
            modulePlan(
              "gut_deep_dive",
              Array.from({ length: 21 }, (_, index) =>
                yesNoQuestion(`q_${index}`, `Question ${index}?`),
              ),
            ),
          ],
        },
        ["question_plan", 0, "questions"],
      );
    });
  });

  describe("QuestionPlanResolved envelope fixtures", () => {
    it("deterministic_module_suppressed", () => {
      const result = QuestionPlanResolved.safeParse(
        buildValidResolvedPlan({
          question_plan: [
            {
              module_key: "gut_deep_dive",
              rationale: "Digestive symptoms require structured follow-up.",
              questions: [yesNoQuestion("bloating")],
              is_deterministic: true,
              was_budget_suppressed: true,
              questions_trimmed_count: 0,
            },
          ],
        }),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path[0] === "question_plan")).toBe(
          true,
        );
        expect(
          result.error.issues.some((issue) =>
            issue.message.includes("INVARIANT VIOLATION"),
          ),
        ).toBe(true);
      }
    });

    it("missing_model_id", () => {
      expectParseFailure(
        QuestionPlanResolved,
        buildValidResolvedPlan({ model_id: "" }),
        ["model_id"],
      );
    });

    it("missing_prompt_version", () => {
      expectParseFailure(
        QuestionPlanResolved,
        buildValidResolvedPlan({ prompt_version: "" }),
        ["prompt_version"],
      );
    });
  });
});
