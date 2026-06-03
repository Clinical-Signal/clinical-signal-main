"use client";

import type { Control } from "@/lib/intake/schemas/question-plan.schema";

import { scheduleAutoAdvance } from "./auto-advance-delay";

type ChipsControlProps = {
  control: Extract<Control, { kind: "chips" }>;
  value: string | string[] | undefined;
  onChange: (next: string | string[]) => void;
  onCommit: () => void;
  onAutoAdvance?: () => void;
  disabled?: boolean;
};

export function ChipsControl({
  control,
  value,
  onChange,
  onCommit,
  onAutoAdvance,
  disabled = false,
}: ChipsControlProps) {
  const selected = new Set(
    Array.isArray(value) ? value : value ? [value] : [],
  );

  const toggle = (optionValue: string) => {
    if (control.multi) {
      const next = new Set(selected);
      if (next.has(optionValue)) {
        next.delete(optionValue);
      } else {
        next.add(optionValue);
      }
      onChange([...next]);
      onCommit();
      return;
    }

    onChange(optionValue);
    scheduleAutoAdvance(onAutoAdvance);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {control.options.map((option) => {
        const isSelected = selected.has(option.value);
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            className={`min-h-12 rounded-full border px-4 text-sm font-medium transition-colors ${
              isSelected
                ? "border-accent bg-accent-soft text-accent"
                : "border-line-strong bg-surface text-ink"
            }`}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
