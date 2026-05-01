/**
 * Intake Branching Engine — configurable rules that control which sections
 * and questions appear based on the patient's answers.
 *
 * Rules are evaluated client-side on every answer change. They support:
 * - Section visibility: show/hide entire sections
 * - Question visibility: show/hide individual questions within a section
 * - Follow-up triggers: surface additional questions when specific answers are given
 *
 * The rule set is versioned and lives in code for MVP. A future admin UI
 * can move these to the database without changing the evaluation engine.
 */

import type { IntakeData, MsqCategory, MsqScore } from "./intake-schema";

// ---------------------------------------------------------------------------
// Rule types
// ---------------------------------------------------------------------------

/** A condition that must evaluate to true for a rule to fire. */
export type BranchCondition =
  | { type: "field_equals"; section: string; field: string; value: unknown }
  | { type: "field_not_empty"; section: string; field: string }
  | { type: "field_gt"; section: string; field: string; value: number }
  | { type: "field_lt"; section: string; field: string; value: number }
  | { type: "field_in"; section: string; field: string; values: unknown[] }
  | { type: "msq_category_score_gt"; category: MsqCategory; threshold: number }
  | { type: "msq_any_symptom_gt"; category: MsqCategory; threshold: MsqScore }
  | { type: "has_symptom_keyword"; keywords: string[] }
  | { type: "sex_equals"; value: "male" | "female" | "intersex" }
  | { type: "age_gt"; value: number }
  | { type: "age_lt"; value: number }
  | { type: "and"; conditions: BranchCondition[] }
  | { type: "or"; conditions: BranchCondition[] }
  | { type: "not"; condition: BranchCondition };

/** A rule that controls visibility of a section or question. */
export interface BranchRule {
  id: string;
  /** What this rule shows/hides */
  target:
    | { type: "section"; sectionKey: string }
    | { type: "question"; sectionKey: string; questionKey: string };
  /** When to show the target (true = show, false = hide) */
  condition: BranchCondition;
  /** Priority: higher priority rules override lower ones for the same target */
  priority?: number;
  /** Optional label for admin/debug UI */
  label?: string;
}

// ---------------------------------------------------------------------------
// Rule evaluation engine
// ---------------------------------------------------------------------------

/** Get a nested field value from intake data. */
function getField(data: IntakeData, section: string, field: string): unknown {
  const sectionData = (data as Record<string, unknown>)[section];
  if (!sectionData || typeof sectionData !== "object") return undefined;

  // Support dot-notation for nested fields: "sleep.quality"
  const parts = field.split(".");
  let current: unknown = sectionData;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Calculate age from DOB string (YYYY-MM-DD). */
function calculateAge(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/** Get total MSQ score for a category. */
function getMsqCategoryScore(data: IntakeData, category: MsqCategory): number {
  const scores = data.symptoms?.msq_scores?.[category];
  if (!scores) return 0;
  return Object.values(scores).reduce<number>((sum, v) => sum + (v ?? 0), 0);
}

/** Check if any symptom in a category exceeds a threshold. */
function hasMsqSymptomAbove(
  data: IntakeData,
  category: MsqCategory,
  threshold: MsqScore,
): boolean {
  const scores = data.symptoms?.msq_scores?.[category];
  if (!scores) return false;
  return Object.values(scores).some((v) => (v ?? 0) > threshold);
}

/** Check if any v1 free-form symptom name matches keywords. */
function hasSymptomKeyword(data: IntakeData, keywords: string[]): boolean {
  const symptoms = data.symptoms?.symptoms;
  if (!symptoms) return false;
  return symptoms.some((s) =>
    keywords.some((kw) => s.name.toLowerCase().includes(kw.toLowerCase())),
  );
}

/** Evaluate a single condition. */
export function evaluateCondition(
  condition: BranchCondition,
  data: IntakeData,
): boolean {
  switch (condition.type) {
    case "field_equals": {
      const val = getField(data, condition.section, condition.field);
      return val === condition.value;
    }
    case "field_not_empty": {
      const val = getField(data, condition.section, condition.field);
      if (val === null || val === undefined || val === "") return false;
      if (Array.isArray(val)) return val.length > 0;
      return true;
    }
    case "field_gt": {
      const val = getField(data, condition.section, condition.field);
      return typeof val === "number" && val > condition.value;
    }
    case "field_lt": {
      const val = getField(data, condition.section, condition.field);
      return typeof val === "number" && val < condition.value;
    }
    case "field_in": {
      const val = getField(data, condition.section, condition.field);
      return condition.values.includes(val);
    }
    case "msq_category_score_gt": {
      return getMsqCategoryScore(data, condition.category) > condition.threshold;
    }
    case "msq_any_symptom_gt": {
      return hasMsqSymptomAbove(data, condition.category, condition.threshold);
    }
    case "has_symptom_keyword": {
      return hasSymptomKeyword(data, condition.keywords);
    }
    case "sex_equals": {
      return data.about_you?.sex_at_birth === condition.value;
    }
    case "age_gt": {
      const age = calculateAge(data.about_you?.date_of_birth ?? "");
      return age !== null && age > condition.value;
    }
    case "age_lt": {
      const age = calculateAge(data.about_you?.date_of_birth ?? "");
      return age !== null && age < condition.value;
    }
    case "and": {
      return condition.conditions.every((c) => evaluateCondition(c, data));
    }
    case "or": {
      return condition.conditions.some((c) => evaluateCondition(c, data));
    }
    case "not": {
      return !evaluateCondition(condition.condition, data);
    }
  }
}

// ---------------------------------------------------------------------------
// Branching result — computed visibility map
// ---------------------------------------------------------------------------

export interface BranchingState {
  /** Which sections are visible. Key = section key from IntakeSectionKey. */
  sections: Record<string, boolean>;
  /** Which questions are visible. Key = "sectionKey.questionKey". */
  questions: Record<string, boolean>;
  /** Number of visible sections (for progress calculation). */
  visibleSectionCount: number;
}

/** Evaluate all rules and return a visibility map. */
export function evaluateBranching(
  data: IntakeData,
  rules: BranchRule[],
): BranchingState {
  const sections: Record<string, boolean> = {};
  const questions: Record<string, boolean> = {};

  // Sort rules by priority (higher wins)
  const sorted = [...rules].sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
  );

  for (const rule of sorted) {
    const visible = evaluateCondition(rule.condition, data);
    if (rule.target.type === "section") {
      sections[rule.target.sectionKey] = visible;
    } else {
      const key = `${rule.target.sectionKey}.${rule.target.questionKey}`;
      questions[key] = visible;
    }
  }

  return {
    sections,
    questions,
    visibleSectionCount: Object.values(sections).filter(Boolean).length,
  };
}

/** Check if a section is visible. Defaults to true if no rule exists. */
export function isSectionVisible(
  state: BranchingState,
  sectionKey: string,
): boolean {
  return state.sections[sectionKey] ?? true;
}

/** Check if a question is visible. Defaults to true if no rule exists. */
export function isQuestionVisible(
  state: BranchingState,
  sectionKey: string,
  questionKey: string,
): boolean {
  return state.questions[`${sectionKey}.${questionKey}`] ?? true;
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export { useBranching } from "./intake-branching-hook";
