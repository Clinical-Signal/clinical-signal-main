"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RecordSummary, ProcessingStatus } from "@/lib/records";

const STATUS_STYLES: Record<ProcessingStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  processing: "bg-blue-100 text-blue-800",
  complete: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<ProcessingStatus, string> = {
  pending: "Queued",
  processing: "Processing",
  complete: "Complete",
  failed: "Failed",
};

export function RecordsList({
  patientId,
  initial,
}: {
  patientId: string;
  initial: RecordSummary[];
}) {
  const [records, setRecords] = useState<RecordSummary[]>(initial);

  useEffect(() => {
    setRecords(initial);
  }, [initial]);

  // Poll while any record is still pending or processing.
  useEffect(() => {
    const anyActive = records.some(
      (r) => r.status === "pending" || r.status === "processing",
    );
    if (!anyActive) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/patients/${patientId}/records`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as RecordSummary[];
        setRecords(
          next.map((r) => ({
            ...r,
            uploadedAt: new Date(r.uploadedAt as unknown as string),
          })),
        );
      } catch {
        // Ignore transient polling errors.
      }
    }, 2500);
    return () => clearInterval(t);
  }, [patientId, records]);

  if (records.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-6 text-sm text-slate-600">
        No records yet. Upload a lab PDF to get started.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
      {records.map((r) => (
        <li key={r.id} className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-medium">
              {r.recordType === "lab" ? "Lab report" : r.recordType}
            </div>
            <div className="text-xs text-slate-500">
              Uploaded {new Date(r.uploadedAt).toLocaleString()}
            </div>
            {r.status === "failed" && r.processingError ? (
              <div className="mt-1 text-xs text-red-700">{r.processingError}</div>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[r.status]}`}>
              {STATUS_LABELS[r.status]}
            </span>
            {r.status === "complete" ? (
              <Link
                className="text-sm underline"
                href={`/dashboard/patients/${patientId}/records/${r.id}`}
              >
                Review
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
