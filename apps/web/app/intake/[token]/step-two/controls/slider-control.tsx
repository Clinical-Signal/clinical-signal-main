"use client";

import type { Control } from "@/lib/intake/schemas/question-plan.schema";

type SliderControlProps = {
  control: Extract<Control, { kind: "slider" }>;
  value: number | undefined;
  onChange: (next: number) => void;
  onCommit: () => void;
  disabled?: boolean;
};

/** Sliders intentionally omit auto-advance — users adjust before confirming via Next. */
export function SliderControl({
  control,
  value,
  onChange,
  onCommit,
  disabled = false,
}: SliderControlProps) {
  const current =
    value ??
    control.default_value ??
    control.min;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between text-sm text-ink-muted">
        <span>
          {current}
          {control.unit ? ` ${control.unit}` : ""}
        </span>
        <span>
          {control.min} – {control.max}
        </span>
      </div>
      <input
        type="range"
        disabled={disabled}
        min={control.min}
        max={control.max}
        step={control.step}
        value={current}
        className="h-2 w-full cursor-pointer accent-accent"
        aria-valuemin={control.min}
        aria-valuemax={control.max}
        aria-valuenow={current}
        onChange={(event) => onChange(Number(event.target.value))}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        onKeyUp={onCommit}
      />
    </div>
  );
}
