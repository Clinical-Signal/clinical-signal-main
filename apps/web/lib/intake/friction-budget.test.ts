/**
 * Friction Budget — Phase 2 TDD scaffold.
 * Matrix: docs/architecture/phase-2-test-matrix.md §4 (FB-01–FB-22), inputs §0.3.
 *
 * Lightweight contract mocks until question-plan Zod wires `friction_budget`.
 */
import { describe, expect, it } from "vitest";
import { applyFrictionBudget } from "./friction-budget";

type FrictionBudgetQuestion = {
  id: string;
  priority: "must_have" | "nice_to_have";
};

type FrictionBudgetModuleInput = {
  module_key: string;
  is_deterministic: boolean;
  questions: FrictionBudgetQuestion[];
};

type FrictionBudgetConfig = {
  max_augmented_modules: number;
  max_questions_per_module: number;
  max_total_augmented_questions: number;
};

type FrictionBudgetModuleOutput = FrictionBudgetModuleInput & {
  was_budget_suppressed: boolean;
  questions_trimmed_count: number;
};

type FrictionBudgetTrimReport = {
  module_key: string;
  trimmed_count: number;
};

type FrictionBudgetResult = {
  modules: FrictionBudgetModuleOutput[];
  deterministic_count: number;
  augmented_count: number;
  suppressed: string[];
  trimmed: FrictionBudgetTrimReport[];
};

type QuestionPriority = FrictionBudgetQuestion["priority"];

const DEFAULT_BUDGET: FrictionBudgetConfig = {
  max_augmented_modules: 4,
  max_questions_per_module: 6,
  max_total_augmented_questions: 18,
};

/** Builds budget config from §0.3 defaults with optional matrix shorthand overrides. */
function budgetConfig(overrides: {
  max_aug?: number;
  max_q?: number;
  max_total_aug?: number;
} = {}): FrictionBudgetConfig {
  return {
    max_augmented_modules:
      overrides.max_aug ?? DEFAULT_BUDGET.max_augmented_modules,
    max_questions_per_module:
      overrides.max_q ?? DEFAULT_BUDGET.max_questions_per_module,
    max_total_augmented_questions:
      overrides.max_total_aug ?? DEFAULT_BUDGET.max_total_augmented_questions,
  };
}

/** `6D(2M+1N)` or bare `0A` / `0D` (zero modules, FB-22). Question group optional when count is 0. */
const MODULE_SEGMENT =
  /^(\d+)([DA])(?:\((\d+)M\+(\d+)N\))?$/;

/**
 * Builds module inputs from §0.3 notation, e.g. `3D(3M+2N)` or
 * `2D(3M+2N) + 2A(2M+2N)` or `6D(2M+1N) + 0A`.
 */
function buildModulesFromNotation(notation: string): FrictionBudgetModuleInput[] {
  const normalized = notation.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const modules: FrictionBudgetModuleInput[] = [];
  let detIndex = 0;
  let augIndex = 0;

  for (const segment of normalized.split(/\s*,\s*|\s+\+\s+/)) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }

    const match = MODULE_SEGMENT.exec(trimmed);
    if (!match) {
      throw new Error(`Invalid friction-budget notation segment: ${segment}`);
    }

    const count = Number(match[1]);
    if (count === 0) {
      continue;
    }

    const kind = match[2];
    const mustCount = Number(match[3] ?? 0);
    const niceCount = Number(match[4] ?? 0);
    const isDeterministic = kind === "D";

    for (let moduleIndex = 0; moduleIndex < count; moduleIndex += 1) {
      const ordinal = isDeterministic ? ++detIndex : ++augIndex;
      const prefix = isDeterministic ? "det" : "aug";
      const questions: FrictionBudgetQuestion[] = [];

      for (let must = 0; must < mustCount; must += 1) {
        questions.push({
          id: `${prefix}_${ordinal}_must_${must}`,
          priority: "must_have" satisfies QuestionPriority,
        });
      }

      for (let nice = 0; nice < niceCount; nice += 1) {
        questions.push({
          id: `${prefix}_${ordinal}_nice_${nice}`,
          priority: "nice_to_have" satisfies QuestionPriority,
        });
      }

      modules.push({
        module_key: `${prefix}_${ordinal}`,
        is_deterministic: isDeterministic,
        questions,
      });
    }
  }

  return modules;
}

function renderedModules(result: FrictionBudgetResult) {
  return result.modules.filter((module) => !module.was_budget_suppressed);
}

function suppressedModules(result: FrictionBudgetResult) {
  return result.modules.filter((module) => module.was_budget_suppressed);
}

function questionCount(module: FrictionBudgetResult["modules"][number]): number {
  return module.questions.length;
}

function mustCount(module: FrictionBudgetResult["modules"][number]): number {
  return module.questions.filter(
    (question) => question.priority === "must_have",
  ).length;
}

function niceCount(module: FrictionBudgetResult["modules"][number]): number {
  return module.questions.filter(
    (question) => question.priority === "nice_to_have",
  ).length;
}

function totalQuestions(modules: FrictionBudgetResult["modules"]): number {
  return modules.reduce((sum, module) => sum + questionCount(module), 0);
}

describe("friction budget (PRD §5.3)", () => {
  it("FB-01", () => {
    const result = applyFrictionBudget([]);

    expect(result).toEqual({
      modules: [],
      deterministic_count: 0,
      augmented_count: 0,
      suppressed: [],
      trimmed: [],
    });
  });

  it("FB-02", () => {
    const result = applyFrictionBudget(buildModulesFromNotation("1D(0M+0N)"));

    expect(renderedModules(result)).toHaveLength(1);
    expect(renderedModules(result)[0]?.was_budget_suppressed).toBe(false);
    expect(renderedModules(result)[0]?.questions_trimmed_count).toBe(0);
  });

  it("FB-03", () => {
    const input = buildModulesFromNotation("3D(3M+2N)");
    const result = applyFrictionBudget(input, budgetConfig());

    expect(renderedModules(result)).toHaveLength(3);
    for (const [index, module] of renderedModules(result).entries()) {
      expect(module.was_budget_suppressed).toBe(false);
      expect(module.questions_trimmed_count).toBe(0);
      expect(questionCount(module)).toBe(questionCount(input[index]!));
    }
  });

  it("FB-04", () => {
    const input = buildModulesFromNotation("5D(2M+1N)");
    const result = applyFrictionBudget(input, budgetConfig({ max_aug: 4 }));

    expect(renderedModules(result)).toHaveLength(5);
    for (const [index, module] of renderedModules(result).entries()) {
      expect(module.was_budget_suppressed).toBe(false);
      expect(questionCount(module)).toBe(questionCount(input[index]!));
    }
  });

  it("FB-05", () => {
    const input = buildModulesFromNotation("6D(2M+1N)");
    const result = applyFrictionBudget(input, budgetConfig({ max_aug: 4 }));

    expect(renderedModules(result)).toHaveLength(6);
    for (const [index, module] of renderedModules(result).entries()) {
      expect(module.was_budget_suppressed).toBe(false);
      expect(questionCount(module)).toBe(questionCount(input[index]!));
    }
  });

  it("FB-06", () => {
    const result = applyFrictionBudget(
      buildModulesFromNotation("1D(4M+4N)"),
      budgetConfig({ max_q: 6 }),
    );
    const module = renderedModules(result)[0];

    expect(module).toBeDefined();
    expect(mustCount(module!)).toBe(4);
    expect(niceCount(module!)).toBe(2);
    expect(questionCount(module!)).toBe(6);
    expect(module!.questions_trimmed_count).toBe(2);
  });

  it("FB-07", () => {
    const result = applyFrictionBudget(
      buildModulesFromNotation("1D(7M+0N)"),
      budgetConfig({ max_q: 6 }),
    );
    const module = renderedModules(result)[0];

    expect(module).toBeDefined();
    expect(mustCount(module!)).toBe(7);
    expect(niceCount(module!)).toBe(0);
    expect(questionCount(module!)).toBe(7);
    expect(module!.questions_trimmed_count).toBe(0);
  });

  it("FB-08", () => {
    const result = applyFrictionBudget(
      buildModulesFromNotation("1D(7M+4N)"),
      budgetConfig({ max_q: 6 }),
    );
    const module = renderedModules(result)[0];

    expect(module).toBeDefined();
    expect(mustCount(module!)).toBe(7);
    expect(niceCount(module!)).toBe(0);
    expect(questionCount(module!)).toBe(7);
    expect(module!.questions_trimmed_count).toBe(4);
  });

  it("FB-09", () => {
    const result = applyFrictionBudget(
      buildModulesFromNotation("1D(6M+4N)"),
      budgetConfig({ max_q: 6 }),
    );
    const module = renderedModules(result)[0];

    expect(module).toBeDefined();
    expect(mustCount(module!)).toBe(6);
    expect(niceCount(module!)).toBe(0);
    expect(questionCount(module!)).toBe(6);
    expect(module!.questions_trimmed_count).toBe(4);
  });

  it("FB-10", () => {
    const result = applyFrictionBudget(
      buildModulesFromNotation("2A(2M+2N)"),
      budgetConfig({ max_aug: 4 }),
    );

    expect(renderedModules(result)).toHaveLength(2);
    expect(suppressedModules(result)).toHaveLength(0);
  });

  it("FB-11", () => {
    const result = applyFrictionBudget(
      buildModulesFromNotation("4A(2M+2N)"),
      budgetConfig({ max_aug: 4 }),
    );

    expect(renderedModules(result)).toHaveLength(4);
    expect(suppressedModules(result)).toHaveLength(0);
  });

  it("FB-12", () => {
    const result = applyFrictionBudget(
      buildModulesFromNotation("5A(2M+2N)"),
      budgetConfig({ max_aug: 4 }),
    );

    expect(renderedModules(result)).toHaveLength(4);
    expect(suppressedModules(result)).toHaveLength(1);
    expect(suppressedModules(result)[0]?.was_budget_suppressed).toBe(true);
    expect(suppressedModules(result)[0]?.module_key).toBe("aug_5");
  });

  it("FB-13", () => {
    const result = applyFrictionBudget(
      buildModulesFromNotation("8A(1M+2N)"),
      budgetConfig({ max_aug: 4 }),
    );

    expect(renderedModules(result)).toHaveLength(4);
    expect(suppressedModules(result)).toHaveLength(4);
  });

  it("FB-14", () => {
    const result = applyFrictionBudget(
      buildModulesFromNotation("4A(0M+5N)"),
      budgetConfig(),
    );
    const rendered = renderedModules(result);

    expect(rendered).toHaveLength(4);
    expect(niceCount(rendered[0]!)).toBe(5);
    expect(niceCount(rendered[1]!)).toBe(5);
    expect(niceCount(rendered[2]!)).toBe(5);
    expect(niceCount(rendered[3]!)).toBe(3);
    expect(totalQuestions(rendered)).toBe(18);
  });

  it("FB-15", () => {
    const input = buildModulesFromNotation("3A(6M+0N)");
    const result = applyFrictionBudget(input, budgetConfig());
    const rendered = renderedModules(result);

    expect(rendered).toHaveLength(3);
    expect(totalQuestions(rendered)).toBe(18);
    for (const [index, module] of rendered.entries()) {
      expect(questionCount(module)).toBe(questionCount(input[index]!));
      expect(module.questions_trimmed_count).toBe(0);
    }
  });

  it("FB-16", () => {
    const input = buildModulesFromNotation("4A(6M+0N)");
    const result = applyFrictionBudget(input, budgetConfig());
    const rendered = renderedModules(result);

    expect(rendered).toHaveLength(4);
    expect(totalQuestions(rendered)).toBe(24);
    for (const [index, module] of rendered.entries()) {
      expect(questionCount(module)).toBe(questionCount(input[index]!));
      expect(mustCount(module)).toBe(6);
    }
  });

  it("FB-17", () => {
    const result = applyFrictionBudget(
      buildModulesFromNotation("2A(2M+8N)"),
      budgetConfig({ max_q: 6 }),
    );
    const rendered = renderedModules(result);

    expect(rendered).toHaveLength(2);
    for (const module of rendered) {
      expect(mustCount(module)).toBe(2);
      expect(niceCount(module)).toBe(4);
      expect(questionCount(module)).toBe(6);
    }
    expect(totalQuestions(rendered)).toBe(12);
  });

  it("FB-18", () => {
    const input = buildModulesFromNotation("2D(3M+2N) + 2A(2M+2N)");
    const result = applyFrictionBudget(input, budgetConfig());

    expect(renderedModules(result)).toHaveLength(4);
    expect(suppressedModules(result)).toHaveLength(0);
    for (const [index, module] of renderedModules(result).entries()) {
      expect(questionCount(module)).toBe(questionCount(input[index]!));
    }
  });

  it("FB-19", () => {
    const result = applyFrictionBudget(
      buildModulesFromNotation("3D(2M+1N) + 6A(1M+2N)"),
      budgetConfig({ max_aug: 4 }),
    );

    expect(
      renderedModules(result).filter((module) => module.is_deterministic),
    ).toHaveLength(3);
    expect(
      renderedModules(result).filter((module) => !module.is_deterministic),
    ).toHaveLength(4);
    expect(suppressedModules(result)).toHaveLength(2);
    expect(
      suppressedModules(result).every((module) => !module.is_deterministic),
    ).toBe(true);
  });

  it("FB-20", () => {
    const input = buildModulesFromNotation("4D(2M+1N) + 4A(1M+2N)");
    const result = applyFrictionBudget(input, budgetConfig({ max_aug: 4 }));

    expect(renderedModules(result)).toHaveLength(8);
    expect(suppressedModules(result)).toHaveLength(0);
    expect(
      renderedModules(result).filter((module) => module.is_deterministic),
    ).toHaveLength(4);
    expect(
      renderedModules(result).filter((module) => !module.is_deterministic),
    ).toHaveLength(4);
  });

  it("FB-21", () => {
    const result = applyFrictionBudget(
      buildModulesFromNotation("5D(2M+1N) + 4A(1M+2N)"),
      budgetConfig({ max_aug: 4 }),
    );

    expect(
      renderedModules(result).filter((module) => module.is_deterministic),
    ).toHaveLength(5);
    expect(
      renderedModules(result).filter((module) => !module.is_deterministic),
    ).toHaveLength(0);
    expect(suppressedModules(result)).toHaveLength(4);
    expect(
      suppressedModules(result).every((module) => !module.is_deterministic),
    ).toBe(true);
  });

  it("FB-22", () => {
    const input = buildModulesFromNotation("6D(2M+1N) + 0A");
    const result = applyFrictionBudget(input, budgetConfig({ max_aug: 4 }));

    expect(renderedModules(result)).toHaveLength(6);
    expect(suppressedModules(result)).toHaveLength(0);
    for (const [index, module] of renderedModules(result).entries()) {
      expect(module.is_deterministic).toBe(true);
      expect(questionCount(module)).toBe(questionCount(input[index]!));
    }
  });
});
