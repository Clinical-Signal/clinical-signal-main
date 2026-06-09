"use client";

import { useState, useTransition } from "react";
import {
  addPreferenceAction,
  updatePreferenceAction,
  deletePreferenceAction,
} from "./actions";
import type { PreferenceCategory } from "@/lib/preferences";

const CATEGORIES: { value: PreferenceCategory; label: string; hint: string }[] = [
  { value: "protocol_structure", label: "Protocol structure", hint: "Phasing, block length, sequencing" },
  { value: "supplements", label: "Supplements", hint: "Brands, max counts, exclusions" },
  { value: "communication_style", label: "Communication style", hint: "Tone, formality, phrases" },
  { value: "branding", label: "Branding", hint: "Practice name, sign-off, contact info" },
  { value: "clinical", label: "Clinical rules", hint: "Always/never include, sequencing" },
  { value: "general", label: "General", hint: "Anything else" },
];

interface PrefItem {
  id: string;
  category: PreferenceCategory;
  categoryLabel: string;
  ruleText: string;
  label: string | null;
  active: boolean;
}

export function PreferencesForm({
  initialPreferences,
  readOnly = false,
}: {
  initialPreferences: PrefItem[];
  readOnly?: boolean;
}) {
  const [prefs, setPrefs] = useState(initialPreferences);
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState<PreferenceCategory>("protocol_structure");
  const [newRule, setNewRule] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!newRule.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addPreferenceAction(newCategory, newRule, newLabel || undefined);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const cat = CATEGORIES.find((c) => c.value === newCategory);
      setPrefs((prev) => [
        ...prev,
        {
          id: result.id!,
          category: newCategory,
          categoryLabel: cat?.label ?? newCategory,
          ruleText: newRule.trim(),
          label: newLabel.trim() || null,
          active: true,
        },
      ]);
      setNewRule("");
      setNewLabel("");
      setAdding(false);
    });
  }

  function handleToggle(id: string, active: boolean) {
    startTransition(async () => {
      const result = await updatePreferenceAction(id, { active: !active });
      if (result.ok) {
        setPrefs((prev) =>
          prev.map((p) => (p.id === id ? { ...p, active: !active } : p)),
        );
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deletePreferenceAction(id);
      if (result.ok) {
        setPrefs((prev) => prev.filter((p) => p.id !== id));
      }
    });
  }

  // Group by category
  const grouped: Record<string, PrefItem[]> = {};
  for (const p of prefs) {
    const key = p.categoryLabel;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }

  return (
    <div>
      {/* Existing rules */}
      {prefs.length === 0 && !adding && (
        <div className="mb-6 rounded-xl border border-line bg-surface-sunken/40 p-8 text-center">
          <p className="text-sm text-ink-muted">
            No preferences set yet. Add rules to customize how the AI generates your protocols.
          </p>
        </div>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="mb-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
            {cat}
          </h3>
          <div className="flex flex-col gap-2">
            {items.map((p) => (
              <div
                key={p.id}
                className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
                  p.active
                    ? "border-line bg-surface"
                    : "border-line/50 bg-surface-sunken/30 opacity-60"
                }`}
              >
                <div className="min-w-0 flex-1">
                  {p.label && (
                    <p className="mb-1 text-xs font-medium text-ink-subtle">
                      {p.label}
                    </p>
                  )}
                  <p className="text-sm text-ink">{p.ruleText}</p>
                </div>
                {readOnly ? null : (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => handleToggle(p.id, p.active)}
                      disabled={isPending}
                      className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-subtle transition-colors hover:bg-surface-sunken disabled:opacity-50"
                    >
                      {p.active ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={isPending}
                      className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger-soft/20 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Add new rule */}
      {!readOnly && adding ? (
        <div className="rounded-xl border border-accent-soft bg-surface p-5">
          <h3 className="mb-4 text-base font-semibold text-ink">Add a rule</h3>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-ink-subtle">
              Category
            </label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as PreferenceCategory)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label} — {c.hint}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-ink-subtle">
              Label (optional)
            </label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Short name, e.g. &quot;4-week blocks&quot;"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-ink-subtle">
              Rule
            </label>
            <textarea
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              placeholder="Describe the rule in your own words. Be specific — the AI will follow this exactly.&#10;&#10;Example: &quot;Structure all protocols as 4-week blocks. Week 1 is prep only (dietary changes, sleep hygiene). Weeks 2-3 are active supplementation. Week 4 is active + journaling. At week 5, start the next 4-week block.&quot;"
              rows={4}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
            />
          </div>

          {error && <p className="mb-3 text-sm text-danger">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={handleAdd}
              disabled={isPending || !newRule.trim()}
              className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save rule"}
            </button>
            <button
              onClick={() => { setAdding(false); setError(null); }}
              className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : !readOnly ? (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent-hover"
        >
          + Add rule
        </button>
      ) : null}
    </div>
  );
}
