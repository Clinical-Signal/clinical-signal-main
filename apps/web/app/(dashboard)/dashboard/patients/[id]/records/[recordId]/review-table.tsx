"use client";

import { useState, useTransition } from "react";
import type { LabValue } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { saveLabsAction } from "./actions";

const FLAGS: LabValue["flag"][] = ["normal", "high", "low", "unknown"];

const FLAG_LABEL: Record<LabValue["flag"], string> = {
  normal: "In range",
  high: "High",
  low: "Low",
  unknown: "Unknown",
};

const cellInput =
  "w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink " +
  "transition-colors focus:border-accent focus:outline-none focus-visible:shadow-focus";

export function LabReviewTable({
  recordId,
  initialLabs,
}: {
  recordId: string;
  initialLabs: LabValue[];
}) {
  const [labs, setLabs] = useState<LabValue[]>(initialLabs);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(i: number, patch: Partial<LabValue>) {
    setSaved(false);
    setLabs((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function removeRow(i: number) {
    setSaved(false);
    setLabs((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveLabsAction(recordId, labs);
      if (res?.error) setError(res.error);
      else setSaved(true);
    });
  }

  if (labs.length === 0) {
    return (
      <EmptyState
        title="No values extracted"
        description="The PDF may have been a scan with no readable text, or the report format wasn't recognized."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-sunken/50 text-left text-xs font-medium uppercase tracking-wide text-ink-subtle">
            <tr>
              <th className="px-3 py-3 font-medium">Test</th>
              <th className="px-3 py-3 font-medium">Value</th>
              <th className="px-3 py-3 font-medium">Unit</th>
              <th className="px-3 py-3 font-medium">Reference</th>
              <th className="px-3 py-3 font-medium">Flag</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {labs.map((row, i) => {
              // Out-of-range rows get a subtle amber tint, never a red
              // shouting border. Calmer + more accurate ('out of range'
              // is information, not an error).
              const flagged = row.flag === "high" || row.flag === "low";
              return (
                <tr
                  key={i}
                  className={
                    flagged ? "bg-warning-soft/40" : "transition-colors hover:bg-surface-sunken/40"
                  }
                >
                  <td className="px-3 py-2 align-top">
                    <input
                      className={cellInput}
                      value={row.test_name}
                      onChange={(e) => update(i, { test_name: e.target.value })}
                      aria-label="Test name"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      className={`${cellInput} w-28`}
                      value={row.value}
                      onChange={(e) => update(i, { value: e.target.value })}
                      aria-label="Value"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      className={`${cellInput} w-24`}
                      value={row.unit ?? ""}
                      onChange={(e) => update(i, { unit: e.target.value || null })}
                      aria-label="Unit"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      className={`${cellInput} w-32`}
                      value={row.reference_range ?? ""}
                      onChange={(e) => update(i, { reference_range: e.target.value || null })}
                      aria-label="Reference range"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <select
                      className={`${cellInput} pr-7`}
                      value={row.flag}
                      onChange={(e) => update(i, { flag: e.target.value as LabValue["flag"] })}
                      aria-label="Flag"
                    >
                      {FLAGS.map((f) => (
                        <option key={f} value={f}>
                          {FLAG_LABEL[f]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-xs text-ink-subtle transition-colors hover:text-danger"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-ink-subtle">
          Out-of-range values highlighted. Edits don&apos;t save until you click Save.
        </div>
        <div className="flex items-center gap-3">
          {saved ? (
            <span className="text-sm text-success">Saved.</span>
          ) : null}
          {error ? (
            <span className="text-sm text-danger">{error}</span>
          ) : null}
          <Button
            onClick={onSave}
            loading={pending}
            loadingText="Saving…"
          >
            Save corrections
          </Button>
        </div>
      </div>
    </div>
  );
}
