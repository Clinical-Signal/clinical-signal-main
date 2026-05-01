/**
 * Unit tests for the intake branching engine.
 *
 * Run with: npx vitest run lib/__tests__/intake-branching.test.ts
 * (or any compatible test runner)
 *
 * Covers:
 * - All condition types (field_equals, field_not_empty, field_gt, field_lt, field_in)
 * - MSQ scoring conditions (msq_category_score_gt, msq_any_symptom_gt)
 * - Symptom keyword matching (has_symptom_keyword)
 * - Demographic conditions (sex_equals, age_gt, age_lt)
 * - Logical combinators (and, or, not)
 * - evaluateBranching with multiple rules and priorities
 * - isSectionVisible / isQuestionVisible defaults
 * - Edge cases: missing data, empty arrays, null values
 */

import { describe, it, expect } from "vitest";
import {
  evaluateCondition,
  evaluateBranching,
  isSectionVisible,
  isQuestionVisible,
  type BranchCondition,
  type BranchRule,
} from "../intake-branching";
import type { IntakeData } from "../intake-schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal IntakeData with only the fields we need per test. */
function makeData(overrides: Partial<IntakeData> = {}): IntakeData {
  return {
    about_you: {},
    health_goals: {},
    symptoms: {},
    lifestyle: {},
    medical_history: {},
    ...overrides,
  } as IntakeData;
}

// ---------------------------------------------------------------------------
// field_equals
// ---------------------------------------------------------------------------

describe("field_equals", () => {
  const cond: BranchCondition = {
    type: "field_equals",
    section: "about_you",
    field: "sex_at_birth",
    value: "female",
  };

  it("returns true when field matches value", () => {
    const data = makeData({ about_you: { sex_at_birth: "female" } as any });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns false when field does not match", () => {
    const data = makeData({ about_you: { sex_at_birth: "male" } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns false when field is missing", () => {
    const data = makeData({ about_you: {} as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns false when section is missing", () => {
    const data = makeData();
    expect(evaluateCondition(cond, { ...data, about_you: undefined as any })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// field_not_empty
// ---------------------------------------------------------------------------

describe("field_not_empty", () => {
  const cond: BranchCondition = {
    type: "field_not_empty",
    section: "lifestyle",
    field: "exercise",
  };

  it("returns true for non-empty string", () => {
    const data = makeData({ lifestyle: { exercise: "running" } as any });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns false for empty string", () => {
    const data = makeData({ lifestyle: { exercise: "" } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns false for null", () => {
    const data = makeData({ lifestyle: { exercise: null } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns false for undefined", () => {
    const data = makeData({ lifestyle: {} as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns true for non-empty array", () => {
    const data = makeData({ lifestyle: { exercise: ["yoga"] } as any });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns false for empty array", () => {
    const data = makeData({ lifestyle: { exercise: [] } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns true for number 0 (truthy non-empty check)", () => {
    const data = makeData({ lifestyle: { exercise: 0 } as any });
    expect(evaluateCondition(cond, data)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// field_gt and field_lt
// ---------------------------------------------------------------------------

describe("field_gt", () => {
  const cond: BranchCondition = {
    type: "field_gt",
    section: "lifestyle",
    field: "stress_level",
    value: 6,
  };

  it("returns true when field > value", () => {
    const data = makeData({ lifestyle: { stress_level: 8 } as any });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns false when field == value", () => {
    const data = makeData({ lifestyle: { stress_level: 6 } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns false when field < value", () => {
    const data = makeData({ lifestyle: { stress_level: 3 } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns false when field is not a number", () => {
    const data = makeData({ lifestyle: { stress_level: "high" } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });
});

describe("field_lt", () => {
  const cond: BranchCondition = {
    type: "field_lt",
    section: "lifestyle",
    field: "sleep_hours",
    value: 6,
  };

  it("returns true when field < value", () => {
    const data = makeData({ lifestyle: { sleep_hours: 4 } as any });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns false when field >= value", () => {
    const data = makeData({ lifestyle: { sleep_hours: 7 } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// field_in
// ---------------------------------------------------------------------------

describe("field_in", () => {
  const cond: BranchCondition = {
    type: "field_in",
    section: "lifestyle",
    field: "alcohol",
    values: ["daily", "weekly"],
  };

  it("returns true when field value is in the list", () => {
    const data = makeData({ lifestyle: { alcohol: "daily" } as any });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns false when field value is not in the list", () => {
    const data = makeData({ lifestyle: { alcohol: "never" } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MSQ conditions
// ---------------------------------------------------------------------------

describe("msq_category_score_gt", () => {
  const cond: BranchCondition = {
    type: "msq_category_score_gt",
    category: "digestive",
    threshold: 5,
  };

  it("returns true when category total exceeds threshold", () => {
    const data = makeData({
      symptoms: {
        msq_scores: {
          digestive: { nausea: 3, bloating: 4 },
        },
      } as any,
    });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns false when category total is at or below threshold", () => {
    const data = makeData({
      symptoms: {
        msq_scores: {
          digestive: { nausea: 2, bloating: 3 },
        },
      } as any,
    });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns false when category is missing", () => {
    const data = makeData({ symptoms: { msq_scores: {} } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns false when symptoms is empty", () => {
    const data = makeData();
    expect(evaluateCondition(cond, data)).toBe(false);
  });
});

describe("msq_any_symptom_gt", () => {
  const cond: BranchCondition = {
    type: "msq_any_symptom_gt",
    category: "skin",
    threshold: 2,
  };

  it("returns true when any symptom exceeds threshold", () => {
    const data = makeData({
      symptoms: {
        msq_scores: {
          skin: { acne: 3, rashes: 1 },
        },
      } as any,
    });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns false when no symptom exceeds threshold", () => {
    const data = makeData({
      symptoms: {
        msq_scores: {
          skin: { acne: 1, rashes: 2 },
        },
      } as any,
    });
    expect(evaluateCondition(cond, data)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// has_symptom_keyword
// ---------------------------------------------------------------------------

describe("has_symptom_keyword", () => {
  const cond: BranchCondition = {
    type: "has_symptom_keyword",
    keywords: ["bloating", "gas"],
  };

  it("returns true when a symptom name matches", () => {
    const data = makeData({
      symptoms: {
        symptoms: [
          { name: "Chronic bloating after meals", severity: 3 },
        ],
      } as any,
    });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("is case-insensitive", () => {
    const data = makeData({
      symptoms: {
        symptoms: [{ name: "Excessive GAS", severity: 2 }],
      } as any,
    });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns false when no symptoms match", () => {
    const data = makeData({
      symptoms: {
        symptoms: [{ name: "Headache", severity: 2 }],
      } as any,
    });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns false when symptoms array is empty", () => {
    const data = makeData({
      symptoms: { symptoms: [] } as any,
    });
    expect(evaluateCondition(cond, data)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sex_equals
// ---------------------------------------------------------------------------

describe("sex_equals", () => {
  it("matches sex_at_birth", () => {
    const cond: BranchCondition = { type: "sex_equals", value: "female" };
    const data = makeData({ about_you: { sex_at_birth: "female" } as any });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns false on mismatch", () => {
    const cond: BranchCondition = { type: "sex_equals", value: "female" };
    const data = makeData({ about_you: { sex_at_birth: "male" } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// age_gt and age_lt
// ---------------------------------------------------------------------------

describe("age conditions", () => {
  // Use a date that makes someone 40 years old (roughly)
  const dob = "1986-01-15";

  it("age_gt returns true when age exceeds value", () => {
    const cond: BranchCondition = { type: "age_gt", value: 35 };
    const data = makeData({ about_you: { date_of_birth: dob } as any });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("age_gt returns false when age is below value", () => {
    const cond: BranchCondition = { type: "age_gt", value: 50 };
    const data = makeData({ about_you: { date_of_birth: dob } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("age_lt returns true when age is below value", () => {
    const cond: BranchCondition = { type: "age_lt", value: 55 };
    const data = makeData({ about_you: { date_of_birth: dob } as any });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns false when DOB is missing", () => {
    const cond: BranchCondition = { type: "age_gt", value: 18 };
    const data = makeData({ about_you: {} as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns false when DOB is invalid", () => {
    const cond: BranchCondition = { type: "age_gt", value: 18 };
    const data = makeData({ about_you: { date_of_birth: "not-a-date" } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Logical combinators
// ---------------------------------------------------------------------------

describe("and", () => {
  it("returns true when all conditions are true", () => {
    const cond: BranchCondition = {
      type: "and",
      conditions: [
        { type: "sex_equals", value: "female" },
        { type: "age_gt", value: 30 },
      ],
    };
    const data = makeData({
      about_you: { sex_at_birth: "female", date_of_birth: "1990-01-01" } as any,
    });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns false when any condition is false", () => {
    const cond: BranchCondition = {
      type: "and",
      conditions: [
        { type: "sex_equals", value: "female" },
        { type: "age_gt", value: 50 },
      ],
    };
    const data = makeData({
      about_you: { sex_at_birth: "female", date_of_birth: "1990-01-01" } as any,
    });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns true for empty conditions (vacuous truth)", () => {
    const cond: BranchCondition = { type: "and", conditions: [] };
    const data = makeData();
    expect(evaluateCondition(cond, data)).toBe(true);
  });
});

describe("or", () => {
  it("returns true when at least one condition is true", () => {
    const cond: BranchCondition = {
      type: "or",
      conditions: [
        { type: "sex_equals", value: "female" },
        { type: "sex_equals", value: "intersex" },
      ],
    };
    const data = makeData({ about_you: { sex_at_birth: "female" } as any });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns false when no condition is true", () => {
    const cond: BranchCondition = {
      type: "or",
      conditions: [
        { type: "sex_equals", value: "female" },
        { type: "sex_equals", value: "intersex" },
      ],
    };
    const data = makeData({ about_you: { sex_at_birth: "male" } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });

  it("returns false for empty conditions", () => {
    const cond: BranchCondition = { type: "or", conditions: [] };
    const data = makeData();
    expect(evaluateCondition(cond, data)).toBe(false);
  });
});

describe("not", () => {
  it("negates a true condition", () => {
    const cond: BranchCondition = {
      type: "not",
      condition: { type: "sex_equals", value: "male" },
    };
    const data = makeData({ about_you: { sex_at_birth: "female" } as any });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("negates a false condition", () => {
    const cond: BranchCondition = {
      type: "not",
      condition: { type: "sex_equals", value: "female" },
    };
    const data = makeData({ about_you: { sex_at_birth: "female" } as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Nested dot-notation fields
// ---------------------------------------------------------------------------

describe("dot-notation field access", () => {
  it("accesses nested fields via dot notation", () => {
    const cond: BranchCondition = {
      type: "field_equals",
      section: "lifestyle",
      field: "sleep.quality",
      value: "poor",
    };
    const data = makeData({
      lifestyle: { sleep: { quality: "poor" } } as any,
    });
    expect(evaluateCondition(cond, data)).toBe(true);
  });

  it("returns undefined for missing nested path", () => {
    const cond: BranchCondition = {
      type: "field_not_empty",
      section: "lifestyle",
      field: "sleep.deep.nested.value",
    };
    const data = makeData({ lifestyle: {} as any });
    expect(evaluateCondition(cond, data)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluateBranching
// ---------------------------------------------------------------------------

describe("evaluateBranching", () => {
  it("evaluates section visibility rules", () => {
    const rules: BranchRule[] = [
      {
        id: "gut-dive",
        target: { type: "section", sectionKey: "gut_deep_dive" },
        condition: {
          type: "msq_category_score_gt",
          category: "digestive",
          threshold: 5,
        },
      },
    ];

    const data = makeData({
      symptoms: {
        msq_scores: { digestive: { nausea: 3, bloating: 4 } },
      } as any,
    });

    const state = evaluateBranching(data, rules);
    expect(state.sections["gut_deep_dive"]).toBe(true);
    expect(state.visibleSectionCount).toBe(1);
  });

  it("evaluates question visibility rules", () => {
    const rules: BranchRule[] = [
      {
        id: "alcohol-amount",
        target: {
          type: "question",
          sectionKey: "lifestyle",
          questionKey: "alcohol_amount",
        },
        condition: {
          type: "field_in",
          section: "lifestyle",
          field: "alcohol",
          values: ["daily", "weekly"],
        },
      },
    ];

    const data = makeData({ lifestyle: { alcohol: "daily" } as any });
    const state = evaluateBranching(data, rules);
    expect(state.questions["lifestyle.alcohol_amount"]).toBe(true);
  });

  it("higher priority rules override lower ones", () => {
    const rules: BranchRule[] = [
      {
        id: "hide-gut",
        target: { type: "section", sectionKey: "gut_deep_dive" },
        condition: {
          type: "field_equals",
          section: "about_you",
          field: "placeholder",
          value: "never-matches",
        },
        priority: 1,
      },
      {
        id: "show-gut",
        target: { type: "section", sectionKey: "gut_deep_dive" },
        condition: {
          type: "msq_category_score_gt",
          category: "digestive",
          threshold: 0,
        },
        priority: 10,
      },
    ];

    const data = makeData({
      symptoms: {
        msq_scores: { digestive: { nausea: 1 } },
      } as any,
    });

    const state = evaluateBranching(data, rules);
    // Higher priority (10) wins — show-gut evaluates last and overwrites
    expect(state.sections["gut_deep_dive"]).toBe(true);
  });

  it("hidden section results in visibleSectionCount = 0", () => {
    const rules: BranchRule[] = [
      {
        id: "hide-gut",
        target: { type: "section", sectionKey: "gut_deep_dive" },
        condition: {
          type: "field_equals",
          section: "about_you",
          field: "placeholder",
          value: "never-matches",
        },
      },
    ];

    const data = makeData();
    const state = evaluateBranching(data, rules);
    expect(state.sections["gut_deep_dive"]).toBe(false);
    expect(state.visibleSectionCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isSectionVisible / isQuestionVisible defaults
// ---------------------------------------------------------------------------

describe("visibility defaults", () => {
  it("isSectionVisible defaults to true for unmentioned sections", () => {
    const state = evaluateBranching(makeData(), []);
    expect(isSectionVisible(state, "some_random_section")).toBe(true);
  });

  it("isQuestionVisible defaults to true for unmentioned questions", () => {
    const state = evaluateBranching(makeData(), []);
    expect(isQuestionVisible(state, "lifestyle", "random_question")).toBe(true);
  });
});
