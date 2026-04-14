"use client";

import { useState, useTransition } from "react";
import { generateProtocolAction } from "./actions";

export function GenerateProtocolButton({ patientId }: { patientId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        className="self-start rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await generateProtocolAction(patientId);
            if (res && !res.ok) setError(res.error);
          });
        }}
      >
        {pending ? "Generating protocol… (30–60s)" : "Generate Protocol"}
      </button>
      {pending ? (
        <p className="text-xs text-slate-500">
          Analyzing intake + records, then drafting both the clinical protocol and
          the phased client action plan. This typically takes 30–60 seconds.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600">Protocol generation failed: {error}</p>
      ) : null}
    </div>
  );
}
