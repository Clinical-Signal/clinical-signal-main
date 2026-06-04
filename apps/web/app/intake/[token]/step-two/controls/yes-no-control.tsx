"use client";

import { scheduleAutoAdvance } from "./auto-advance-delay";
import {
  yesNoBaseClass,
  yesNoIdleClass,
  yesNoSelectedClass,
} from "./field-styles";

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
        className={`${yesNoBaseClass} ${
          value === true ? yesNoSelectedClass : yesNoIdleClass
        }`}
        onClick={() => select(true)}
      >
        Yes
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === false}
        className={`${yesNoBaseClass} ${
          value === false ? yesNoSelectedClass : yesNoIdleClass
        }`}
        onClick={() => select(false)}
      >
        No
      </button>
    </div>
  );
}
