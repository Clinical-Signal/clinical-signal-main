"use client";

import { useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SLIDE_COLORS: Record<string, string> = {
  overview: "bg-accent-soft/30 border-accent-soft",
  findings: "bg-warning-soft/30 border-warning-soft",
  plan: "bg-success-soft/30 border-success-soft",
  actions: "bg-success-soft/30 border-success-soft",
  supplements: "bg-accent-soft/30 border-accent-soft",
  timeline: "bg-surface-sunken/60 border-line",
  next_steps: "bg-surface-sunken/60 border-line",
};

export function CallDeckView({ content }: { content: Record<string, unknown> }) {
  const c = content as any;
  const slides = (c.slides ?? []) as any[];
  const [showNotes, setShowNotes] = useState(true);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        {c.title && (
          <h3 className="text-base font-semibold text-ink">{c.title}</h3>
        )}
        <button
          onClick={() => setShowNotes(!showNotes)}
          className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-sunken"
        >
          {showNotes ? "Hide" : "Show"} speaker notes
        </button>
      </div>

      {/* Suggested flow */}
      {c.suggested_flow && (
        <p className="mb-4 text-sm italic text-ink-muted">{c.suggested_flow}</p>
      )}

      {/* Slides */}
      <div className="flex flex-col gap-4">
        {slides.map((slide: any, i: number) => {
          const colorClass =
            SLIDE_COLORS[slide.type] ?? "bg-surface-sunken/40 border-line";
          return (
            <div
              key={i}
              className={`rounded-xl border p-5 ${colorClass}`}
            >
              {/* Slide header */}
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/10 text-sm font-bold text-ink">
                  {slide.slide_number ?? i + 1}
                </span>
                <div>
                  <h4 className="text-base font-semibold text-ink">
                    {slide.title}
                  </h4>
                  {slide.type && (
                    <span className="text-xs text-ink-subtle">{slide.type}</span>
                  )}
                </div>
              </div>

              {/* Bullet points */}
              {slide.bullet_points?.length > 0 && (
                <ul className="ml-5 list-disc space-y-1.5 text-sm text-ink-muted">
                  {slide.bullet_points.map((point: string, j: number) => (
                    <li key={j}>{point}</li>
                  ))}
                </ul>
              )}

              {/* Speaker notes */}
              {showNotes && slide.speaker_notes && (
                <div className="mt-4 rounded-md border border-line bg-surface p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-subtle">
                    Speaker notes
                  </p>
                  <p className="text-sm text-ink-muted">{slide.speaker_notes}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
