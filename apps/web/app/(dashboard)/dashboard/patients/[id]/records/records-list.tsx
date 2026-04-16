"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RecordSummary, ProcessingStatus } from "@/lib/records";
import { Badge, StatusDot } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const STATUS_TONE: Record<
  ProcessingStatus,
  "neutral" | "accent" | "warning" | "success" | "danger"
> = {
  pending: "neutral",
  processing: "accent",
  complete: "success",
  failed: "danger",
};

const STATUS_LABELS: Record<ProcessingStatus, string> = {
  pending: "Queued",
  processing: "Extracting",
  complete: "Ready",
  failed: "Failed",
};

const RECORD_TYPE_LABELS: Record<string, string> = {
  lab: "Lab report",
  clinical_note: "Clinical note",
  imaging: "Imaging",
  intake_form: "Intake",
  protocol_export: "Protocol PDF",
  other: "Other",
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
      <EmptyState
        title="No records yet"
        description="Upload a lab PDF and we'll extract structured values for review."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <ul className="divide-y divide-line">
        {records.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-4 px-5 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-ink">
                  {RECORD_TYPE_LABELS[r.recordType] ?? r.recordType}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-subtle">
                  <StatusDot tone={STATUS_TONE[r.status]} />
                  {STATUS_LABELS[r.status]}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-ink-subtle">
                Uploaded {new Date(r.uploadedAt).toLocaleString()}
              </div>
              {r.status === "failed" && r.processingError ? (
                <div className="mt-1 max-w-xl text-xs text-danger">
                  {r.processingError}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {r.status === "complete" ? (
                <Link
                  className="text-sm text-ink-muted transition-colors hover:text-ink"
                  href={`/dashboard/patients/${patientId}/records/${r.id}`}
                >
                  Review →
                </Link>
              ) : r.status === "processing" ? (
                <Badge tone="accent">working…</Badge>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
