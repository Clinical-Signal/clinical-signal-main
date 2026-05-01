"use client";

import { useMemo } from "react";
import type { IntakeData } from "./intake-schema";
import {
  evaluateBranching,
  isSectionVisible,
  isQuestionVisible,
  type BranchingState,
  type BranchRule,
} from "./intake-branching";
import { CLINICAL_BRANCHING_RULES } from "./intake-branching-rules";

/**
 * React hook that evaluates branching rules against current intake data.
 * Returns visibility helpers that components use to show/hide sections + questions.
 *
 * Memoized so it only re-evaluates when data actually changes.
 */
export function useBranching(
  data: IntakeData,
  customRules?: BranchRule[],
) {
  const rules = customRules ?? CLINICAL_BRANCHING_RULES;

  const state = useMemo(
    () => evaluateBranching(data, rules),
    // Stringify data for stable memo — intake data is small enough that this is fine
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(data), rules],
  );

  return {
    state,
    /** Check if a section should be visible. True by default if no rule exists. */
    showSection: (sectionKey: string) => isSectionVisible(state, sectionKey),
    /** Check if a question should be visible. True by default if no rule exists. */
    showQuestion: (sectionKey: string, questionKey: string) =>
      isQuestionVisible(state, sectionKey, questionKey),
    /** Get a summary of what's visible for debug/admin. */
    summary: state,
  };
}
