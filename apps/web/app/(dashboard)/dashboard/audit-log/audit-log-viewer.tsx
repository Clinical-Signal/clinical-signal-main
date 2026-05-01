"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditLogEntry } from "@/app/api/audit-logs/route";

// ---------------------------------------------------------------------------
// Action type display config
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login_success: { label: "Login", color: "text-green-700 bg-green-50 border-green-200" },
  login_failure: { label: "Login failed", color: "text-red-700 bg-red-50 border-red-200" },
  logout: { label: "Logout", color: "text-ink-muted bg-surface-raised border-line" },
  signup: { label: "Signup", color: "text-blue-700 bg-blue-50 border-blue-200" },
  password_reset_requested: { label: "Password reset requested", color: "text-amber-700 bg-amber-50 border-amber-200" },
  password_reset_completed: { label: "Password reset done", color: "text-amber-700 bg-amber-50 border-amber-200" },
  password_changed: { label: "Password changed", color: "text-amber-700 bg-amber-50 border-amber-200" },
  session_expired: { label: "Session expired", color: "text-ink-muted bg-surface-raised border-line" },
  analysis_generated: { label: "Analysis generated", color: "text-violet-700 bg-violet-50 border-violet-200" },
  protocol_generated: { label: "Protocol generated", color: "text-violet-700 bg-violet-50 border-violet-200" },
  intake_saved: { label: "Intake saved", color: "text-blue-700 bg-blue-50 border-blue-200" },
  intake_submitted: { label: "Intake submitted", color: "text-blue-700 bg-blue-50 border-blue-200" },
  protocol_edited: { label: "Protocol edited", color: "text-violet-700 bg-violet-50 border-violet-200" },
  protocol_status_changed: { label: "Protocol status changed", color: "text-violet-700 bg-violet-50 border-violet-200" },
  protocol_exported: { label: "Protocol exported", color: "text-green-700 bg-green-50 border-green-200" },
};

const ACTION_OPTIONS = Object.keys(ACTION_LABELS);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  patients: { id: string; name: string }[];
}

export function AuditLogViewer({ patients }: Props) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 50;

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [patientFilter, setPatientFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (actionFilter) params.set("action", actionFilter);
      if (patientFilter) params.set("patientId", patientFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      console.error("Audit log fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, patientFilter, startDate, endDate]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [actionFilter, patientFilter, startDate, endDate]);

  const totalPages = Math.ceil(total / pageSize);

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 rounded-lg border border-line bg-surface-raised p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink-subtle">Action</label>
          <select
            className="rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">All actions</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]?.label ?? a}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink-subtle">Patient</label>
          <select
            className="rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink"
            value={patientFilter}
            onChange={(e) => setPatientFilter(e.target.value)}
          >
            <option value="">All patients</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink-subtle">From</label>
          <input
            type="date"
            className="rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink-subtle">To</label>
          <input
            type="date"
            className="rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {(actionFilter || patientFilter || startDate || endDate) && (
          <button
            className="self-end rounded px-2 py-1.5 text-xs text-ink-subtle hover:text-ink"
            onClick={() => {
              setActionFilter("");
              setPatientFilter("");
              setStartDate("");
              setEndDate("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="text-sm text-ink-muted">
        {loading ? "Loading..." : `${total} event${total === 1 ? "" : "s"}`}
        {total > pageSize && !loading && ` — page ${page} of ${totalPages}`}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-raised text-left">
              <th className="px-3 py-2 font-medium text-ink-subtle">When</th>
              <th className="px-3 py-2 font-medium text-ink-subtle">Action</th>
              <th className="px-3 py-2 font-medium text-ink-subtle">Who</th>
              <th className="px-3 py-2 font-medium text-ink-subtle">Patient</th>
              <th className="px-3 py-2 font-medium text-ink-subtle">IP address</th>
              <th className="px-3 py-2 font-medium text-ink-subtle">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-ink-muted">
                  No audit events found.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-ink-muted">
                  Loading audit events...
                </td>
              </tr>
            )}
            {!loading &&
              entries.map((entry) => {
                const actionInfo = ACTION_LABELS[entry.action] ?? {
                  label: entry.action,
                  color: "text-ink-muted bg-surface-raised border-line",
                };
                const meta = entry.metadata && Object.keys(entry.metadata).length > 0
                  ? entry.metadata
                  : null;

                return (
                  <tr key={entry.id} className="hover:bg-surface-raised/50">
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">
                      {formatDate(entry.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${actionInfo.color}`}
                      >
                        {actionInfo.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {entry.practitioner_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {entry.patient_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-muted">
                      {entry.ip_address ?? "—"}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-xs text-ink-muted">
                      {meta ? JSON.stringify(meta) : "—"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            className="rounded border border-line px-3 py-1.5 text-sm text-ink-subtle hover:bg-surface-raised disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="text-sm text-ink-muted">
            Page {page} of {totalPages}
          </span>
          <button
            className="rounded border border-line px-3 py-1.5 text-sm text-ink-subtle hover:bg-surface-raised disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
