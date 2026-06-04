"use client";

import type { Control } from "@/lib/intake/schemas/question-plan.schema";

import { handleEnterToAdvance } from "./enter-to-advance";
import { fieldInputClass } from "./field-styles";

type NumericControlProps = {
  control: Extract<Control, { kind: "numeric" }>;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  onCommit: () => void;
  onAutoAdvance?: () => void;
  disabled?: boolean;
};

export function NumericControl({
  control,
  value,
  onChange,
  onCommit,
  onAutoAdvance,
  disabled = false,
}: NumericControlProps) {
  const min = control.min;
  const max = control.max;

  return (
    <div className="space-y-2">
      <input
        type="number"
        disabled={disabled}
        value={value ?? ""}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        className={fieldInputClass}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") {
            onChange(undefined);
            return;
          }
          const parsed = Number(raw);
          if (Number.isNaN(parsed)) {
            return;
          }
          if (min !== undefined && parsed < min) {
            return;
          }
          if (max !== undefined && parsed > max) {
            return;
          }
          onChange(parsed);
        }}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key !== "Enter") {
            return;
          }
          const raw = event.currentTarget.value;
          if (raw.trim() === "") {
            return;
          }
          const parsed = Number(raw);
          if (Number.isNaN(parsed)) {
            return;
          }
          if (min !== undefined && parsed < min) {
            return;
          }
          if (max !== undefined && parsed > max) {
            return;
          }
          onChange(parsed);
          handleEnterToAdvance(event, onAutoAdvance);
        }}
      />
      {control.unit ? (
        <p className="text-xs text-ink-subtle">Unit: {control.unit}</p>
      ) : null}
      {min !== undefined || max !== undefined ? (
        <p className="text-xs text-ink-subtle">
          {min !== undefined ? `Min ${min}` : null}
          {min !== undefined && max !== undefined ? " · " : null}
          {max !== undefined ? `Max ${max}` : null}
        </p>
      ) : null}
    </div>
  );
}
