"use client";

import { useState, useTransition } from "react";
import type { LabValue } from "@/lib/records";
import { saveLabsAction } from "./actions";

const FLAGS: LabValue["flag"][] = ["normal", "high", "low", "unknown"];

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
      <p className="rounded border border-dashed border-slate-300 p-6 text-sm text-slate-600">
        No lab values were extracted from this PDF.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">Test</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2">Flag</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {labs.map((row, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <input
                    className="w-full rounded border border-slate-200 px-2 py-1"
                    value={row.test_name}
                    onChange={(e) => update(i, { test_name: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="w-28 rounded border border-slate-200 px-2 py-1"
                    value={row.value}
                    onChange={(e) => update(i, { value: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="w-24 rounded border border-slate-200 px-2 py-1"
                    value={row.unit ?? ""}
                    onChange={(e) => update(i, { unit: e.target.value || null })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="w-32 rounded border border-slate-200 px-2 py-1"
                    value={row.reference_range ?? ""}
                    onChange={(e) => update(i, { reference_range: e.target.value || null })}
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    className="rounded border border-slate-200 px-2 py-1"
                    value={row.flag}
                    onChange={(e) => update(i, { flag: e.target.value as LabValue["flag"] })}
                  >
                    {FLAGS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="text-xs text-red-700 underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save corrections"}
        </button>
        {saved ? <span className="text-sm text-emerald-700">Saved.</span> : null}
        {error ? <span className="text-sm text-red-700">{error}</span> : null}
      </div>
    </div>
  );
}
