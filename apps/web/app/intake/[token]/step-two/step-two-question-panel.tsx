"use client";

import type { StepTwoFlatStep } from "@/lib/intake/step-two-storage";

import { QuestionControl } from "./controls/question-control";

type StepTwoQuestionPanelProps = {
  step: StepTwoFlatStep;
  value: unknown;
  onValueChange: (
    questionId: string,
    next: unknown,
    persistImmediately?: boolean,
  ) => void;
  onCommit: () => void;
  onAutoAdvance: () => void;
};

export function StepTwoQuestionPanel({
  step,
  value,
  onValueChange,
  onCommit,
  onAutoAdvance,
}: StepTwoQuestionPanelProps) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-base font-medium text-ink">{step.question.prompt}</legend>
      {step.question.help_text ? (
        <p className="text-sm text-ink-muted">{step.question.help_text}</p>
      ) : null}
      <QuestionControl
        question={step.question}
        value={value}
        onValueChange={onValueChange}
        onCommit={onCommit}
        onAutoAdvance={onAutoAdvance}
      />
    </fieldset>
  );
}
