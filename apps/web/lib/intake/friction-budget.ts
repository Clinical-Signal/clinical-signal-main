export type FrictionBudgetQuestion = {
  id: string;
  priority: "must_have" | "nice_to_have";
};

export type FrictionBudgetModuleInput = {
  module_key: string;
  is_deterministic: boolean;
  questions: FrictionBudgetQuestion[];
};

export type FrictionBudgetModuleOutput = FrictionBudgetModuleInput & {
  was_budget_suppressed: boolean;
  questions_trimmed_count: number;
};

export type FrictionBudgetConfig = {
  max_augmented_modules: number;
  max_questions_per_module: number;
  max_total_augmented_questions: number;
};

export type FrictionBudgetTrimReport = {
  module_key: string;
  trimmed_count: number;
};

export type FrictionBudgetResult = {
  modules: FrictionBudgetModuleOutput[];
  deterministic_count: number;
  augmented_count: number;
  suppressed: string[];
  trimmed: FrictionBudgetTrimReport[];
};

const DEFAULT_CONFIG: FrictionBudgetConfig = {
  max_augmented_modules: 4,
  max_questions_per_module: 6,
  max_total_augmented_questions: 18,
};

function trimModuleQuestions(
  questions: FrictionBudgetQuestion[],
  maxQuestionsPerModule: number,
): { questions: FrictionBudgetQuestion[]; trimmedCount: number } {
  const mustHave = questions.filter(
    (question) => question.priority === "must_have",
  );
  const niceToHave = questions.filter(
    (question) => question.priority === "nice_to_have",
  );

  if (mustHave.length >= maxQuestionsPerModule) {
    return {
      questions: mustHave,
      trimmedCount: questions.length - mustHave.length,
    };
  }

  const niceAllowed = maxQuestionsPerModule - mustHave.length;
  const keptNice = niceToHave.slice(0, niceAllowed);
  const kept = [...mustHave, ...keptNice];

  return {
    questions: kept,
    trimmedCount: questions.length - kept.length,
  };
}

function countQuestions(questions: FrictionBudgetQuestion[]): number {
  return questions.length;
}

function totalAugmentedQuestions(
  modules: FrictionBudgetModuleOutput[],
): number {
  return modules.reduce((sum, module) => {
    if (module.is_deterministic || module.was_budget_suppressed) {
      return sum;
    }

    return sum + countQuestions(module.questions);
  }, 0);
}

function recordTrim(
  trimmed: FrictionBudgetTrimReport[],
  moduleKey: string,
): void {
  const existing = trimmed.find((entry) => entry.module_key === moduleKey);
  if (existing) {
    existing.trimmed_count += 1;
    return;
  }

  trimmed.push({ module_key: moduleKey, trimmed_count: 1 });
}

function findLastNiceToHaveIndex(
  questions: FrictionBudgetQuestion[],
): number {
  for (let index = questions.length - 1; index >= 0; index -= 1) {
    if (questions[index]?.priority === "nice_to_have") {
      return index;
    }
  }

  return -1;
}

function applyTotalAugmentedQuestionCap(
  modules: FrictionBudgetModuleOutput[],
  maxTotalAugmentedQuestions: number,
  trimmed: FrictionBudgetTrimReport[],
): void {
  let total = totalAugmentedQuestions(modules);

  while (total > maxTotalAugmentedQuestions) {
    let removed = false;

    for (let index = modules.length - 1; index >= 0; index -= 1) {
      const module = modules[index];
      if (
        !module ||
        module.is_deterministic ||
        module.was_budget_suppressed
      ) {
        continue;
      }

      const niceIndex = findLastNiceToHaveIndex(module.questions);
      if (niceIndex === -1) {
        continue;
      }

      module.questions = module.questions.filter(
        (_, questionIndex) => questionIndex !== niceIndex,
      );
      module.questions_trimmed_count += 1;
      recordTrim(trimmed, module.module_key);
      total -= 1;
      removed = true;
      break;
    }

    if (!removed) {
      break;
    }
  }
}

export function applyFrictionBudget(
  modules: FrictionBudgetModuleInput[],
  config?: FrictionBudgetConfig,
): FrictionBudgetResult {
  const budget = config ?? DEFAULT_CONFIG;
  const deterministicModuleCount = modules.filter(
    (module) => module.is_deterministic,
  ).length;
  const suppressAllAugmented =
    deterministicModuleCount > budget.max_augmented_modules;

  const suppressed: string[] = [];
  const trimmed: FrictionBudgetTrimReport[] = [];
  const outputModules: FrictionBudgetModuleOutput[] = [];
  let augmentedModuleIndex = 0;

  for (const module of modules) {
    if (!module.is_deterministic) {
      const shouldSuppress =
        suppressAllAugmented ||
        augmentedModuleIndex >= budget.max_augmented_modules;
      augmentedModuleIndex += 1;

      if (shouldSuppress) {
        outputModules.push({
          module_key: module.module_key,
          is_deterministic: false,
          questions: [],
          was_budget_suppressed: true,
          questions_trimmed_count: module.questions.length,
        });
        suppressed.push(module.module_key);
        continue;
      }
    }

    const perModuleTrim = trimModuleQuestions(
      module.questions,
      budget.max_questions_per_module,
    );

    outputModules.push({
      module_key: module.module_key,
      is_deterministic: module.is_deterministic,
      questions: perModuleTrim.questions,
      was_budget_suppressed: false,
      questions_trimmed_count: perModuleTrim.trimmedCount,
    });

    if (perModuleTrim.trimmedCount > 0) {
      trimmed.push({
        module_key: module.module_key,
        trimmed_count: perModuleTrim.trimmedCount,
      });
    }
  }

  applyTotalAugmentedQuestionCap(
    outputModules,
    budget.max_total_augmented_questions,
    trimmed,
  );

  const renderedModules = outputModules.filter(
    (module) => !module.was_budget_suppressed,
  );

  return {
    modules: outputModules,
    deterministic_count: renderedModules.filter(
      (module) => module.is_deterministic,
    ).length,
    augmented_count: renderedModules.filter(
      (module) => !module.is_deterministic,
    ).length,
    suppressed,
    trimmed,
  };
}
