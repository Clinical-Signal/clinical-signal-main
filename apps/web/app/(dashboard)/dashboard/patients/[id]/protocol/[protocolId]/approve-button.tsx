"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApproveButton({
  patientId,
  protocolId,
}: {
  patientId: string;
  protocolId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function handleApprove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/patients/${patientId}/protocol/${protocolId}/approve`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to approve");
        setConfirming(false);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming && !loading ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-subtle">
            This will supersede all prior versions.
          </span>
          <button
            onClick={() => setConfirming(false)}
            className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            className="inline-flex h-10 items-center justify-center rounded-md bg-success px-4 text-sm font-medium text-ink-inverse transition-colors hover:opacity-90"
          >
            Confirm approve
          </button>
        </div>
      ) : (
        <button
          onClick={handleApprove}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center rounded-md bg-success px-4 text-sm font-medium text-ink-inverse transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Approving…" : "Approve protocol"}
        </button>
      )}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
