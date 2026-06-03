export const AUTO_ADVANCE_DELAY_MS = 300;

export function scheduleAutoAdvance(onAutoAdvance?: () => void): void {
  if (!onAutoAdvance) {
    return;
  }
  window.setTimeout(() => onAutoAdvance(), AUTO_ADVANCE_DELAY_MS);
}
