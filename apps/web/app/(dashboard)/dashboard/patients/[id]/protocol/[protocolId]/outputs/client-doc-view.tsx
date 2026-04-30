"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function ClientDocView({ content }: { content: Record<string, unknown> }) {
  const c = content as any;
  const layers = (c.layers ?? []) as any[];

  return (
    <article className="rounded-xl border border-line bg-surface p-6 print:border-none print:p-0">
      {/* Title and greeting */}
      {c.title && (
        <h3 className="mb-2 text-xl font-semibold text-ink">{c.title}</h3>
      )}
      {c.greeting && (
        <p className="mb-6 text-sm leading-relaxed text-ink-muted">{c.greeting}</p>
      )}

      {/* Layers / Phases */}
      {layers.map((layer: any, i: number) => (
        <div
          key={i}
          className="mb-6 rounded-lg border border-line bg-surface-sunken/30 p-5"
        >
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-ink-inverse">
              {layer.layer ?? i + 1}
            </span>
            <h4 className="text-base font-semibold text-ink">
              {layer.title ?? `Phase ${i + 1}`}
            </h4>
          </div>

          {layer.why_this_comes_first && (
            <p className="mb-4 text-sm italic text-ink-muted">
              {layer.why_this_comes_first}
            </p>
          )}

          {/* Daily routine */}
          {layer.daily_routine && (
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <RoutineBlock
                label="Morning"
                items={layer.daily_routine.morning}
              />
              <RoutineBlock
                label="With meals"
                items={layer.daily_routine.with_meals}
              />
              <RoutineBlock
                label="Evening"
                items={layer.daily_routine.evening}
              />
            </div>
          )}

          {/* What to continue */}
          {layer.what_to_continue?.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                Continue from earlier
              </p>
              <ul className="mt-1 ml-5 list-disc space-y-1 text-sm text-ink-muted">
                {layer.what_to_continue.map((item: string, j: number) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Expected outcomes */}
          {(layer.what_to_expect ?? layer.desired_outcomes)?.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                What to expect
              </p>
              <ul className="mt-1 ml-5 list-disc space-y-1 text-sm text-ink-muted">
                {(layer.what_to_expect ?? layer.desired_outcomes).map(
                  (item: string, j: number) => (
                    <li key={j}>{item}</li>
                  ),
                )}
              </ul>
            </div>
          )}

          {/* Signs it's working */}
          {(layer.signs_its_working ?? layer.how_youll_know_its_working)?.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                Signs it&apos;s working
              </p>
              <ul className="mt-1 ml-5 list-disc space-y-1 text-sm text-ink-muted">
                {(layer.signs_its_working ?? layer.how_youll_know_its_working).map(
                  (item: string, j: number) => (
                    <li key={j}>{item}</li>
                  ),
                )}
              </ul>
            </div>
          )}

          {/* When to move forward */}
          {layer.when_to_move_forward && (
            <div className="rounded-md border border-accent-soft bg-accent-soft/20 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-accent">
                When to move to the next phase
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {layer.when_to_move_forward}
              </p>
            </div>
          )}
        </div>
      ))}

      {/* Foods */}
      {(c.foods_to_emphasize?.length > 0 || c.foods_to_minimize?.length > 0) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          {c.foods_to_emphasize?.length > 0 && (
            <div className="rounded-lg border border-line p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-success">
                Foods to emphasize
              </p>
              <ul className="ml-5 list-disc space-y-1 text-sm text-ink-muted">
                {c.foods_to_emphasize.map((f: string, i: number) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {c.foods_to_minimize?.length > 0 && (
            <div className="rounded-lg border border-line p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-warning">
                Foods to minimize
              </p>
              <ul className="ml-5 list-disc space-y-1 text-sm text-ink-muted">
                {c.foods_to_minimize.map((f: string, i: number) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Supplement summary */}
      {c.supplement_summary?.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-subtle">
            Supplement summary
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-subtle">
                  <th className="pb-2 pr-4">Supplement</th>
                  <th className="pb-2 pr-4">When</th>
                  <th className="pb-2">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {c.supplement_summary.map((s: any, i: number) => (
                  <tr key={i} className="border-b border-line/50">
                    <td className="py-2 pr-4 font-medium text-ink">{s.name}</td>
                    <td className="py-2 pr-4 text-ink-muted">{s.when}</td>
                    <td className="py-2 text-ink-muted">{s.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Closing */}
      {c.closing && (
        <p className="mb-4 text-sm leading-relaxed text-ink-muted">{c.closing}</p>
      )}

      {/* When to contact us */}
      {c.when_to_contact_us?.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning-soft bg-warning-soft/20 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-warning">
            When to contact us
          </p>
          <ul className="ml-5 list-disc space-y-1 text-sm text-ink-muted">
            {c.when_to_contact_us.map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      {c.disclaimer && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-xs text-ink-faint">{c.disclaimer}</p>
        </div>
      )}
    </article>
  );
}

function RoutineBlock({
  label,
  items,
}: {
  label: string;
  items?: Array<{ action: string; why?: string; how_it_helps?: string }>;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-subtle">
        {label}
      </p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm">
            <span className="font-medium text-ink">{item.action}</span>
            {(item.why || item.how_it_helps) && (
              <p className="mt-0.5 text-xs text-ink-faint">
                {item.why ?? item.how_it_helps}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
