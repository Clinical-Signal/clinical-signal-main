"use client";

import type { Control } from "@/lib/intake/schemas/question-plan.schema";

import { handleEnterToAdvance } from "./enter-to-advance";
import { fieldInputClass, fieldTextareaClass } from "./field-styles";

type FreeTextControlProps = {
  control: Extract<Control, { kind: "free_text" }>;
  value: string | undefined;
  onChange: (next: string) => void;
  onCommit: () => void;
  onAutoAdvance?: () => void;
  disabled?: boolean;
};

export function FreeTextControl({
  control,
  value,
  onChange,
  onCommit,
  onAutoAdvance,
  disabled = false,
}: FreeTextControlProps) {
  const text = value ?? "";
  const atLimit = text.length >= control.max_chars;

  const field = control.multiline ? (
    <textarea
      disabled={disabled}
      value={text}
      maxLength={control.max_chars}
      rows={5}
      placeholder={control.placeholder}
      className={fieldTextareaClass}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
    />
  ) : (
    <input
      type="text"
      disabled={disabled}
      value={text}
      maxLength={control.max_chars}
      placeholder={control.placeholder}
      className={fieldInputClass}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => handleEnterToAdvance(event, onAutoAdvance)}
    />
  );

  return (
    <div className="space-y-2">
      {field}
      <p
        className={`text-xs ${atLimit ? "text-warning" : "text-ink-subtle"}`}
        aria-live="polite"
      >
        {text.length} / {control.max_chars} characters
      </p>
    </div>
  );
}
