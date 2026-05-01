"use client";

import { useState, useTransition } from "react";
import type { PreferenceCategory } from "@/lib/preferences";

const CATEGORY_LABELS: Record<string, string> = {
  protocol_structure: "Protocol structure",
  supplements: "Supplements",
  communication_style: "Communication style",
  branding: "Branding",
  clinical: "Clinical rules",
  general: "General",
};

interface Suggestion {
  id: string;
  category: PreferenceCategory;
  suggestedRule: string;
  label: string | null;
  reasoning: string;
}

export function SuggestedPreferences({
  initialSuggestions,
}: {
  initialSuggestions: Suggestion[];
}) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [isPending, startTransition] = useTransition();
  const [actionState, setActionState] = useState<Record<string, string>>({});

  if (suggestions.length === 0) return null;

  function handleAction(id: string, action: "accept" | "dismiss") {
    startTransition(async () => {
      try {
        const res = await fetch("/api/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, suggestionId: id }),
        });
        if (!res.ok) throw new Error("Failed");
        setActionState((prev) => ({ ...prev, [id]: action === "accept" ? "accepted" : "dismissed" }));
        // Remove from list after a brief delay so the user sees the result
        setTimeout(() => {
          setSuggestions((prev) => prev.filter((s) => s.id !== id));
        }, 1500);
      } catch {
        setActionState((prev) => ({ ...prev, [id]: "error" }));
      }
    });
  }

  return (
    <div className="mb-8 rounded-xl border border-accent-soft/60 bg-accent-soft/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-lg">&#x2728;</span>
        <h2 className="text-base font-semibold text-ink">
          Suggested preferences
        </h2>
        <span className="rounded-full bg-accent-soft/30 px-2 py-0.5 text-xs font-medium text-accent">
          {suggestions.length} new
        </span>
      </div>
      <p className="mb-4 text-sm text-ink-subtle">
        Based on how you've been editing protocols, we noticed some patterns.
        Accept to add them as rules the AI will follow automatically, or dismiss if they don't apply.
      </p>

      <div className="flex flex-col gap-3">
        {suggestions.map((s) => {
          const state = actionState[s.id];
          return (
            <div
              key={s.id}
              className={`rounded-lg border p-4 transition-all ${
                state === "accepted"
                  ? "border-success/40 bg-success/5"
                  : state === "dismissed"
                    ? "border-line/30 bg-surface-sunken/30 opacity-50"
                    : "border-line bg-surface"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                  {CATEGORY_LABELS[s.category] ?? s.category}
                </span>
                {s.label && (
                  <span className="text-xs font-medium text-ink-subtle">{s.label}</span>
                )}
              </div>
              <p className="mb-1 text-sm text-ink">{s.suggestedRule}</p>
              <p className="mb-3 text-xs italic text-ink-faint">{s.reasoning}</p>

              {state === "accepted" ? (
                <p className="text-xs font-medium text-success-emphasis">Added to your preferences</p>
              ) : state === "dismissed" ? (
                <p className="text-xs font-medium text-ink-faint">Dismissed</p>
              ) : state === "error" ? (
                <p className="text-xs font-medium text-danger">Something went wrong — try again</p>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAction(s.id, "accept")}
                    disabled={isPending}
                    className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-medium text-ink-inverse transition-colors hover:bg-accent-hover disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleAction(s.id, "dismiss")}
                    disabled={isPending}
                    className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-xs font-medium text-ink-subtle transition-colors hover:bg-surface-sunken disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
