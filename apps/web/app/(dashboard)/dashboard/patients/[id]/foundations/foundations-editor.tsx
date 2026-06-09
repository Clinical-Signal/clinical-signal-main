"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  type ChecklistItem,
  createDefaultItems,
} from "./checklist-data";

interface SavedPlan {
  id: string;
  items: ChecklistItem[];
  practitionerNotes: string | null;
  assignedAt: string;
  updatedAt: string;
}

export function FoundationsEditor({
  patientId,
  canAssign = true,
}: {
  patientId: string;
  canAssign?: boolean;
}) {
  const [items, setItems] = useState<ChecklistItem[]>(createDefaultItems);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [existingPlan, setExistingPlan] = useState<SavedPlan | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing plan if one exists
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/patients/${patientId}/foundations`);
        const data = await res.json();
        if (data.exists && data.plan) {
          setExistingPlan(data.plan);
          setItems(data.plan.items);
          setNotes(data.plan.practitionerNotes ?? "");
        }
      } catch {
        // non-fatal — just show defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [patientId]);

  const toggleItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    );
    setSaved(false);
  }, []);

  const updateItemNotes = useCallback((id: string, value: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, notes: value } : item,
      ),
    );
    setSaved(false);
  }, []);

  const selectedCount = items.filter((i) => i.selected).length;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const selectedItems = items.filter((i) => i.selected);
      const res = await fetch(`/api/patients/${patientId}/foundations`, {
        method: existingPlan ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedItems,
          practitionerNotes: notes || undefined,
        }),
      });
      if (!res.ok) {
        setError("Failed to save checklist. Please try again.");
        return;
      }
      const data = await res.json();
      if (data.ok || data.plan) {
        setSaved(true);
        setExistingPlan(data.plan);
      } else {
        setError("Unexpected response. Please try again.");
      }
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [items, notes, patientId, existingPlan]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-ink-muted">
        Loading foundational plan…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status bar */}
      {existingPlan && (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-sunken px-4 py-3 text-sm">
          <Badge tone="success">Assigned</Badge>
          <span className="text-ink-subtle">
            Last updated{" "}
            {new Date(existingPlan.updatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      )}

      {/* Topic cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">
            Checklist topics ({selectedCount} of {items.length} selected)
          </h2>
          {canAssign ? (
            <button
              type="button"
              className="text-xs text-accent hover:text-accent-hover"
              onClick={() => {
                const allSelected = items.every((i) => i.selected);
                setItems((prev) =>
                  prev.map((i) => ({ ...i, selected: !allSelected })),
                );
                setSaved(false);
              }}
            >
              {items.every((i) => i.selected) ? "Deselect all" : "Select all"}
            </button>
          ) : null}
        </div>

        {items.map((item) => (
          <TopicCard
            key={item.id}
            item={item}
            readOnly={!canAssign}
            onToggle={toggleItem}
            onNotesChange={updateItemNotes}
          />
        ))}
      </div>

      {/* Practitioner notes */}
      <div>
        <label
          htmlFor="practitioner-notes"
          className="mb-1.5 block text-sm font-medium text-ink"
        >
          Notes for this patient (optional)
        </label>
        <textarea
          id="practitioner-notes"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          rows={3}
          placeholder="Any specific guidance, modifications, or context for this patient's foundational work…"
          value={notes}
          readOnly={!canAssign}
          onChange={(e) => {
            setNotes(e.target.value);
            setSaved(false);
          }}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft/30 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        {canAssign ? (
          <Button
            onClick={handleSave}
            loading={saving}
            loadingText="Saving…"
            disabled={selectedCount === 0}
          >
            {existingPlan ? "Update checklist" : "Assign checklist"}
          </Button>
        ) : null}
        {saved && (
          <span className="text-sm text-success">
            ✓ Checklist {existingPlan ? "updated" : "assigned"} successfully
          </span>
        )}
        {canAssign && selectedCount === 0 && (
          <span className="text-sm text-ink-muted">
            Select at least one topic to assign
          </span>
        )}
      </div>
    </div>
  );
}

function TopicCard({
  item,
  readOnly = false,
  onToggle,
  onNotesChange,
}: {
  item: ChecklistItem;
  readOnly?: boolean;
  onToggle: (id: string) => void;
  onNotesChange: (id: string, value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-lg border transition-colors ${
        item.selected
          ? "border-accent/30 bg-accent/5"
          : "border-line bg-surface opacity-60"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={item.selected}
          disabled={readOnly}
          onChange={() => onToggle(item.id)}
          className="mt-0.5 h-4 w-4 rounded border-line text-accent focus:ring-accent"
          aria-label={`Include ${item.title}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
              {item.topic}
            </span>
          </div>
          <h3 className="text-sm font-medium text-ink">{item.title}</h3>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-xs text-ink-muted hover:text-ink"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {/* Expandable detail */}
      {expanded && (
        <div className="border-t border-line/50 px-4 py-3 pl-11">
          <p className="text-sm text-ink-subtle leading-relaxed">
            {item.description}
          </p>
          <p className="mt-2 text-xs text-ink-muted italic">
            {item.resources}
          </p>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-ink-subtle">
              Custom notes for this topic
            </label>
            <textarea
              className="w-full rounded border border-line bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
              rows={2}
              placeholder="Add personalized guidance for this patient…"
              value={item.notes}
              readOnly={readOnly}
              onChange={(e) => onNotesChange(item.id, e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
