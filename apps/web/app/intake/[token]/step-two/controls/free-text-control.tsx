"use client";

import type { KeyboardEvent } from "react";

import type { Control } from "@/lib/intake/schemas/question-plan.schema";

type FreeTextControlProps = {
  control: Extract<Control, { kind: "free_text" }>;
  value: string | undefined;
  onChange: (next: string) => void;
  onCommit: () => void;
  onAutoAdvance?: () => void;
  disabled?: boolean;
};

function handleEnterAdvance(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  text: string,
  onAutoAdvance?: () => void,
): void {
  if (event.key !== "Enter" || event.shiftKey) {
    return;
  }
  if (!text.trim()) {
    return;
  }

  event.preventDefault();
  event.currentTarget.blur();
  onAutoAdvance?.();
}

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
      className="w-full rounded-md border border-line-strong bg-surface px-3 py-3 text-base text-ink"
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
      className="min-h-12 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-ink"
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => handleEnterAdvance(event, text, onAutoAdvance)}
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
