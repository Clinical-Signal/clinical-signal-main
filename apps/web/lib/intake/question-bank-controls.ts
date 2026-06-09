import type { Question } from "./schemas/question-plan.schema";

export function yesNo(
  id: string,
  prompt: string,
  priority: Question["priority"] = "must_have",
  required = true,
): Question {
  return {
    id,
    prompt,
    control: { kind: "yes_no" },
    priority,
    required,
  };
}

export function chips(
  id: string,
  prompt: string,
  options: Array<{ value: string; label: string }>,
  multi = false,
  required = true,
): Question {
  return {
    id,
    prompt,
    control: { kind: "chips", multi, options },
    priority: "must_have",
    required,
  };
}

export function slider(
  id: string,
  prompt: string,
  min: number,
  max: number,
  step: number,
  unit?: string,
  required = true,
): Question {
  const control: Question["control"] = {
    kind: "slider",
    min,
    max,
    step,
  };
  if (unit !== undefined) {
    return {
      id,
      prompt,
      control: { ...control, unit },
      priority: "must_have",
      required,
    };
  }
  return {
    id,
    prompt,
    control,
    priority: "must_have",
    required,
  };
}

export function freeText(
  id: string,
  prompt: string,
  multiline: boolean,
  maxChars: number,
  required = false,
): Question {
  return {
    id,
    prompt,
    control: { kind: "free_text", multiline, max_chars: maxChars },
    priority: "must_have",
    required,
  };
}

export function numeric(
  id: string,
  prompt: string,
  min: number,
  max: number,
  required = false,
): Question {
  return {
    id,
    prompt,
    control: { kind: "numeric", min, max },
    priority: "must_have",
    required,
  };
}

export function bristol(id: string, prompt: string): Question {
  return {
    id,
    prompt,
    control: { kind: "bristol" },
    priority: "must_have",
    required: false,
  };
}
