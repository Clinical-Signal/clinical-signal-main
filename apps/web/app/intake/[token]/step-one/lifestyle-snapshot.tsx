"use client";

import {
  createEmptyLifestyle,
  type Lifestyle,
} from "@/lib/intake/schemas/step-one.schema";

/** PRD slice 3.5e — light sleep / stress / movement snapshot. */
export function LifestyleSnapshotScreen({
  token: _token,
}: {
  token: string;
  value: Lifestyle;
  onChange: (next: Lifestyle) => void;
  onIntakeDataSynced: (lifestyle: Lifestyle) => void;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-muted">
      <p className="font-medium text-ink">Lifestyle snapshot</p>
      <p className="mt-2">
        Sleep, stress, and movement fields ship in task 3.5e. Use Back to continue
        editing earlier sections.
      </p>
    </section>
  );
}

export function normalizeLifestyleSnapshotFromIntake(
  data: Partial<Lifestyle> | undefined,
): Lifestyle {
  const empty = createEmptyLifestyle();
  if (!data) {
    return empty;
  }
  return { ...empty, ...data };
}
