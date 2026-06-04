"use client";

import type { Control, Question } from "@/lib/intake/schemas/question-plan.schema";

import { BristolControl } from "./bristol-control";
import { ChipsControl } from "./chips-control";
import { FreeTextControl } from "./free-text-control";
import { NumericControl } from "./numeric-control";
import { SliderControl } from "./slider-control";
import { YesNoControl } from "./yes-no-control";

export type QuestionControlProps = {
  question: Question;
  value: unknown;
  onValueChange: (
    questionId: string,
    next: unknown,
    persistImmediately?: boolean,
  ) => void;
  onCommit: () => void;
  onAutoAdvance?: () => void;
  disabled?: boolean;
};

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && !Number.isNaN(value) ? value : undefined;
}

function readChipsValue(
  value: unknown,
  multi: boolean,
): string | string[] | undefined {
  if (multi) {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string")
      ? value
      : [];
  }
  return readString(value);
}

export function QuestionControl({
  question,
  value,
  onValueChange,
  onCommit,
  onAutoAdvance,
  disabled = false,
}: QuestionControlProps) {
  const control: Control = question.control;
  const setValue = (next: unknown, persistImmediately = false) =>
    onValueChange(question.id, next, persistImmediately);
  const autoAdvanceProps =
    onAutoAdvance !== undefined ? { onAutoAdvance } : {};

  switch (control.kind) {
    case "yes_no":
      return (
        <YesNoControl
          value={readBoolean(value)}
          disabled={disabled}
          onChange={(next) => setValue(next, true)}
          {...autoAdvanceProps}
        />
      );
    case "chips": {
      const chipsAdvance =
        !control.multi && onAutoAdvance !== undefined ? { onAutoAdvance } : {};
      return (
        <ChipsControl
          control={control}
          value={readChipsValue(value, control.multi)}
          disabled={disabled}
          onChange={(next) => setValue(next, true)}
          onCommit={onCommit}
          {...chipsAdvance}
        />
      );
    }
    case "slider":
      return (
        <SliderControl
          control={control}
          value={readNumber(value)}
          disabled={disabled}
          onChange={(next) => setValue(next)}
          onCommit={onCommit}
        />
      );
    case "free_text":
      return (
        <FreeTextControl
          control={control}
          value={readString(value)}
          disabled={disabled}
          onChange={(next) => setValue(next)}
          onCommit={onCommit}
          {...autoAdvanceProps}
        />
      );
    case "numeric":
      return (
        <NumericControl
          control={control}
          value={readNumber(value)}
          disabled={disabled}
          onChange={(next) => setValue(next)}
          onCommit={onCommit}
          {...autoAdvanceProps}
        />
      );
    case "bristol":
      return (
        <BristolControl
          value={readString(value)}
          disabled={disabled}
          onChange={(next) => setValue(next, true)}
          {...autoAdvanceProps}
        />
      );
    default: {
      const _exhaustive: never = control;
      return _exhaustive;
    }
  }
}
