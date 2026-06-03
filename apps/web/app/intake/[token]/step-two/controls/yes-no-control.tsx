"use client";

import { scheduleAutoAdvance } from "./auto-advance-delay";

type YesNoControlProps = {
  value: boolean | undefined;
  onChange: (next: boolean) => void;
  onAutoAdvance?: () => void;
  disabled?: boolean;
};

export function YesNoControl({
  value,
  onChange,
  onAutoAdvance,
  disabled = false,
}: YesNoControlProps) {
  const select = (next: boolean) => {
    onChange(next);
    scheduleAutoAdvance(onAutoAdvance);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === true}
        className={`min-h-12 rounded-md border px-4 text-base font-medium transition-colors ${
          value === true
            ? "border-accent bg-accent text-ink-inverse"
            : "border-line-strong bg-surface text-ink"
        }`}
        onClick={() => select(true)}
      >
        Yes
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === false}
        className={`min-h-12 rounded-md border px-4 text-base font-medium transition-colors ${
          value === false
            ? "border-accent bg-accent text-ink-inverse"
            : "border-line-strong bg-surface text-ink"
        }`}
        onClick={() => select(false)}
      >
        No
      </button>
    </div>
  );
}
