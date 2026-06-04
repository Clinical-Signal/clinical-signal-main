"use client";

import { scheduleAutoAdvance } from "./auto-advance-delay";
import {
  chipBaseClass,
  chipIdleClass,
  chipSelectedClass,
} from "./field-styles";

const BRISTOL_OPTIONS = [
  { value: "1", label: "Type 1" },
  { value: "2", label: "Type 2" },
  { value: "3", label: "Type 3" },
  { value: "4", label: "Type 4" },
  { value: "5", label: "Type 5" },
  { value: "6", label: "Type 6" },
  { value: "7", label: "Type 7" },
] as const;

type BristolControlProps = {
  value: string | undefined;
  onChange: (next: string) => void;
  onAutoAdvance?: () => void;
  disabled?: boolean;
};

export function BristolControl({
  value,
  onChange,
  onAutoAdvance,
  disabled = false,
}: BristolControlProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {BRISTOL_OPTIONS.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            className={`${chipBaseClass} rounded-md px-3 text-sm ${
              isSelected ? chipSelectedClass : chipIdleClass
            }`}
            onClick={() => {
              onChange(option.value);
              scheduleAutoAdvance(onAutoAdvance);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
