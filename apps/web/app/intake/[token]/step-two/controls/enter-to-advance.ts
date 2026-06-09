import type { KeyboardEvent } from "react";

/** Enter on single-line fields: blur (autosave) then advance. Multiline ignores plain Enter. */
export function handleEnterToAdvance(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  onAutoAdvance?: () => void,
): boolean {
  if (event.key !== "Enter" || event.shiftKey) {
    return false;
  }

  const raw = event.currentTarget.value;
  if (raw.trim() === "") {
    return false;
  }

  event.preventDefault();
  event.currentTarget.blur();
  onAutoAdvance?.();
  return true;
}
