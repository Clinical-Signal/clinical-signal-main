import type { Control, Question } from "./schemas/question-plan.schema";

const BRISTOL_LABELS: Record<string, string> = {
  "1": "Bristol Type 1",
  "2": "Bristol Type 2",
  "3": "Bristol Type 3",
  "4": "Bristol Type 4",
  "5": "Bristol Type 5",
  "6": "Bristol Type 6",
  "7": "Bristol Type 7",
};

function chipLabel(
  control: Extract<Control, { kind: "chips" }>,
  value: string,
): string {
  return control.options.find((option) => option.value === value)?.label ?? value;
}

function formatChips(
  control: Extract<Control, { kind: "chips" }>,
  value: unknown,
): string | null {
  if (control.multi) {
    if (!Array.isArray(value) || value.length === 0) {
      return null;
    }
    const labels = value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => chipLabel(control, entry));
    return labels.length > 0 ? labels.join(", ") : null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return chipLabel(control, value);
}

function formatNumeric(
  control: Extract<Control, { kind: "numeric" | "slider" }>,
  value: unknown,
): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  const unit = control.unit?.trim();
  return unit ? `${value} ${unit}` : String(value);
}

export function formatQuestionAnswer(
  question: Question,
  value: unknown,
): string | null {
  const control = question.control;

  switch (control.kind) {
    case "yes_no":
      if (typeof value !== "boolean") {
        return null;
      }
      return value ? "Yes" : "No";
    case "chips":
      return formatChips(control, value);
    case "slider":
    case "numeric":
      return formatNumeric(control, value);
    case "bristol":
      if (typeof value !== "string" || !value.trim()) {
        return null;
      }
      return BRISTOL_LABELS[value] ?? `Bristol Type ${value}`;
    case "free_text": {
      if (typeof value !== "string") {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    default:
      return null;
  }
}

export const UNANSWERED_LABEL = "Not answered";
