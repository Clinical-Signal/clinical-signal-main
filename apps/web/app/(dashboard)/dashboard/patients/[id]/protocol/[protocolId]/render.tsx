/* eslint-disable @typescript-eslint/no-explicit-any */
// Protocol renderer — purpose-built views for key sections.
// Falls back to a generic renderer for unknown/extra fields.

import React from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function titleize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const PRIORITY_COLORS: Record<string, string> = {
  foundational: "bg-emerald-100 text-emerald-800",
  supportive: "bg-sky-100 text-sky-800",
  optional: "bg-gray-100 text-gray-600",
};

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  const cls = PRIORITY_COLORS[priority] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {priority}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Generic fallback (still needed for unknown keys)
// ---------------------------------------------------------------------------

export function RenderValue({ value }: { value: unknown }): React.ReactElement {
  if (value === null || value === undefined) {
    return <span className="text-ink-faint">—</span>;
  }
  if (typeof value === "string") {
    return <span className="whitespace-pre-wrap">{value}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-ink-faint">(none)</span>;
    const allPrimitive = value.every(
      (v) => v === null || ["string", "number", "boolean"].includes(typeof v),
    );
    if (allPrimitive) {
      return (
        <ul className="ml-5 list-disc space-y-1">
          {value.map((v, i) => (
            <li key={i}>
              <RenderValue value={v} />
            </li>
          ))}
        </ul>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        {value.map((v, i) => (
          <div key={i} className="rounded-lg border border-line bg-surface p-3">
            <RenderValue value={v} />
          </div>
        ))}
      </div>
    );
  }
  const obj = value as Record<string, unknown>;
  return (
    <dl className="flex flex-col gap-2">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
            {titleize(k)}
          </dt>
          <dd className="mt-1 text-sm">
            <RenderValue value={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Supplement Protocol — TABLE grouped by priority
// ---------------------------------------------------------------------------

function SupplementProtocolSection({ items }: { items: any[] }) {
  if (!items?.length) return null;

  // Group by priority: foundational → supportive → optional → untagged
  const order = ["foundational", "supportive", "optional"];
  const grouped: Record<string, any[]> = {};
  for (const item of items) {
    const key = item.priority ?? "other";
    (grouped[key] ??= []).push(item);
  }
  const sortedGroups = [
    ...order.filter((k) => grouped[k]?.length),
    ...Object.keys(grouped).filter((k) => !order.includes(k)),
  ];

  return (
    <div className="flex flex-col gap-4">
      {sortedGroups.map((group) => (
        <div key={group}>
          <div className="mb-2">
            <PriorityBadge priority={group !== "other" ? group : undefined} />
            {group === "other" && (
              <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                Additional
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-subtle">
                  <th className="pb-2 pr-3">Supplement</th>
                  <th className="pb-2 pr-3">Dosage</th>
                  <th className="pb-2 pr-3">Timing</th>
                  <th className="pb-2 pr-3">Duration</th>
                  <th className="pb-2">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {grouped[group].map((s: any, i: number) => (
                  <tr key={i} className="border-b border-line/50 align-top">
                    <td className="py-2.5 pr-3 font-medium text-ink">{s.name}</td>
                    <td className="py-2.5 pr-3 text-ink-muted">{s.dosage ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-ink-muted">{s.timing ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-ink-muted">{s.duration ?? "—"}</td>
                    <td className="py-2.5 text-ink-muted">{s.rationale ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Cautions row (rendered below table if any exist) */}
          {grouped[group].some((s: any) => s.cautions) && (
            <div className="mt-2 space-y-1">
              {grouped[group]
                .filter((s: any) => s.cautions)
                .map((s: any, i: number) => (
                  <p key={i} className="text-xs text-warning">
                    <span className="font-medium">{s.name}:</span> {s.cautions}
                  </p>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily Protocol — table with timing-based rows
// ---------------------------------------------------------------------------

function DailyProtocolSection({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-subtle">
            <th className="pb-2 pr-3">Time</th>
            <th className="pb-2 pr-3">Action</th>
            <th className="pb-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, i: number) => (
            <tr key={i} className="border-b border-line/50 align-top">
              <td className="py-2.5 pr-3 font-medium text-ink">{item.time ?? item.timing ?? "—"}</td>
              <td className="py-2.5 pr-3 text-ink-muted">{item.action ?? item.item ?? "—"}</td>
              <td className="py-2.5 text-ink-muted">{item.notes ?? item.rationale ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Systems Analysis — visual cards showing connections
// ---------------------------------------------------------------------------

function SystemsAnalysisSection({ systems }: { systems: any[] }) {
  if (!systems?.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {systems.map((sys: any, i: number) => (
        <div key={i} className="rounded-lg border border-line bg-surface-sunken/30 p-4">
          <h4 className="mb-1 text-sm font-semibold text-ink">{sys.system}</h4>
          <p className="text-sm text-ink-muted">{sys.finding}</p>
          {sys.connects_to?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sys.connects_to.map((c: string, j: number) => (
                <span
                  key={j}
                  className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
                >
                  → {c}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dietary Recommendations — grouped by priority
// ---------------------------------------------------------------------------

function DietarySection({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-2">
      {items.map((item: any, i: number) => (
        <div key={i} className="flex items-start gap-3 rounded-lg border border-line/60 bg-surface-sunken/20 p-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">{item.recommendation}</span>
              <PriorityBadge priority={item.priority} />
            </div>
            {item.rationale && (
              <p className="mt-1 text-xs text-ink-faint">{item.rationale}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lifestyle Modifications — grouped by priority
// ---------------------------------------------------------------------------

function LifestyleSection({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-2">
      {items.map((item: any, i: number) => (
        <div key={i} className="flex items-start gap-3 rounded-lg border border-line/60 bg-surface-sunken/20 p-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">{item.modification}</span>
              <PriorityBadge priority={item.priority} />
            </div>
            {item.rationale && (
              <p className="mt-1 text-xs text-ink-faint">{item.rationale}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lab Retesting — clean table
// ---------------------------------------------------------------------------

function LabRetestingSection({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-subtle">
            <th className="pb-2 pr-3">Test</th>
            <th className="pb-2 pr-3">Timing</th>
            <th className="pb-2">Rationale</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, i: number) => (
            <tr key={i} className="border-b border-line/50 align-top">
              <td className="py-2.5 pr-3 font-medium text-ink">{item.test}</td>
              <td className="py-2.5 pr-3 text-ink-muted">{item.timing ?? "—"}</td>
              <td className="py-2.5 text-ink-muted">{item.rationale ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Follow-up Timeline
// ---------------------------------------------------------------------------

function FollowUpSection({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <div className="relative space-y-4 pl-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
      {items.map((item: any, i: number) => (
        <div key={i} className="relative">
          <div className="absolute -left-6 top-1.5 h-3 w-3 rounded-full border-2 border-accent bg-surface" />
          <h4 className="text-sm font-semibold text-ink">{item.milestone}</h4>
          <p className="text-sm text-ink-muted">{item.focus}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Areas of Uncertainty — callout cards
// ---------------------------------------------------------------------------

function UncertaintySection({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-3">
      {items.map((item: any, i: number) => (
        <div key={i} className="rounded-lg border border-warning-soft bg-warning-soft/10 p-4">
          <h4 className="text-sm font-semibold text-ink">{item.issue}</h4>
          {item.recommended_evaluation && (
            <p className="mt-1 text-sm text-ink-muted">
              <span className="font-medium text-ink-subtle">Evaluate with:</span>{" "}
              {item.recommended_evaluation}
            </p>
          )}
          {item.impact_if_wrong && (
            <p className="mt-1 text-xs text-ink-faint">
              <span className="font-medium">If different:</span> {item.impact_if_wrong}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client Action Plan — Phases / Layers
// ---------------------------------------------------------------------------

function ClientPhasesSection({ phases }: { phases: any[] }) {
  if (!phases?.length) return null;
  return (
    <div className="space-y-4">
      {phases.map((phase: any, i: number) => (
        <div key={i} className="rounded-lg border border-line bg-surface-sunken/20 p-5">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-ink-inverse">
              {phase.phase ?? phase.layer ?? i + 1}
            </span>
            <div>
              <h4 className="text-base font-semibold text-ink">
                {phase.title ?? `Phase ${i + 1}`}
              </h4>
              {phase.weeks && (
                <p className="text-xs text-ink-subtle">{phase.weeks}</p>
              )}
            </div>
          </div>

          {(phase.why_this_comes_first) && (
            <p className="mb-4 rounded-md bg-accent/5 px-3 py-2 text-sm italic text-ink-muted">
              {phase.why_this_comes_first}
            </p>
          )}

          {/* Daily routine (from v2 derivative outputs) */}
          {phase.daily_routine && (
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              {["morning", "with_meals", "evening"].map((time) => {
                const items = phase.daily_routine[time];
                if (!items?.length) return null;
                return (
                  <div key={time} className="rounded-lg border border-line p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-subtle">
                      {titleize(time)}
                    </p>
                    <ul className="space-y-2">
                      {items.map((item: any, j: number) => (
                        <li key={j} className="text-sm">
                          <span className="font-medium text-ink">
                            {typeof item === "string" ? item : item.action}
                          </span>
                          {item.how_it_helps && (
                            <p className="mt-0.5 text-xs text-ink-faint">{item.how_it_helps}</p>
                          )}
                          {item.why && (
                            <p className="mt-0.5 text-xs text-ink-faint">{item.why}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {/* What to start (v1 format) */}
          {phase.what_to_start?.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-subtle">
                What to start
              </p>
              <div className="space-y-1.5">
                {phase.what_to_start.map((item: any, j: number) => (
                  <div key={j} className="rounded-md border border-line/50 px-3 py-2">
                    <span className="text-sm font-medium text-ink">
                      {typeof item === "string" ? item : item.action}
                    </span>
                    {item.how_it_helps && (
                      <p className="mt-0.5 text-xs text-ink-faint">{item.how_it_helps}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What to continue */}
          {phase.what_to_continue?.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-subtle">
                Continue from earlier
              </p>
              <ul className="ml-5 list-disc space-y-1 text-sm text-ink-muted">
                {phase.what_to_continue.map((item: string, j: number) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Expected outcomes */}
          {(phase.desired_outcomes ?? phase.what_to_expect)?.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-600">
                What to expect
              </p>
              <ul className="ml-5 list-disc space-y-1 text-sm text-ink-muted">
                {(phase.desired_outcomes ?? phase.what_to_expect).map(
                  (item: string, j: number) => (
                    <li key={j}>{item}</li>
                  ),
                )}
              </ul>
            </div>
          )}

          {/* Signs it's working */}
          {(phase.how_youll_know_its_working ?? phase.signs_its_working)?.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-accent">
                Signs it&apos;s working
              </p>
              <ul className="ml-5 list-disc space-y-1 text-sm text-ink-muted">
                {(phase.how_youll_know_its_working ?? phase.signs_its_working).map(
                  (item: string, j: number) => (
                    <li key={j}>{item}</li>
                  ),
                )}
              </ul>
            </div>
          )}

          {/* When to move forward */}
          {phase.when_to_move_forward && (
            <div className="rounded-md border border-accent-soft bg-accent-soft/20 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-accent">
                When to move to next phase
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {phase.when_to_move_forward}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section dispatcher — routes each key to its purpose-built renderer
// ---------------------------------------------------------------------------

const SECTION_RENDERERS: Record<string, (value: any) => React.ReactElement | null> = {
  supplement_protocol: (v) => <SupplementProtocolSection items={v} />,
  daily_protocol: (v) => <DailyProtocolSection items={v} />,
  systems_analysis: (v) => <SystemsAnalysisSection systems={v} />,
  dietary_recommendations: (v) => <DietarySection items={v} />,
  lifestyle_modifications: (v) => <LifestyleSection items={v} />,
  lab_retesting: (v) => <LabRetestingSection items={v} />,
  follow_up_timeline: (v) => <FollowUpSection items={v} />,
  areas_of_uncertainty: (v) => <UncertaintySection items={v} />,
  // Client plan sections
  phases: (v) => <ClientPhasesSection phases={v} />,
  layers: (v) => <ClientPhasesSection phases={v} />,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function ProtocolSection({
  title,
  sectionKey,
  content,
}: {
  title: string;
  sectionKey?: string;
  content: unknown;
}) {
  const renderer = sectionKey ? SECTION_RENDERERS[sectionKey] : undefined;

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
        {title}
      </h3>
      <div className="text-sm text-ink-muted">
        {renderer && (Array.isArray(content) || typeof content === "object")
          ? renderer(content)
          : <RenderValue value={content} />}
      </div>
    </section>
  );
}

export function RenderSections({
  content,
  order,
  skip = [],
}: {
  content: Record<string, unknown>;
  order?: string[];
  skip?: string[];
}) {
  const skipSet = new Set(skip);
  const keys = order ?? Object.keys(content);
  const remaining = Object.keys(content).filter(
    (k) => !skipSet.has(k) && !keys.includes(k),
  );
  return (
    <div className="flex flex-col gap-6">
      {[...keys, ...remaining]
        .filter((k) => k in content && !skipSet.has(k))
        .map((k) => (
          <ProtocolSection
            key={k}
            title={titleize(k)}
            sectionKey={k}
            content={content[k]}
          />
        ))}
    </div>
  );
}
