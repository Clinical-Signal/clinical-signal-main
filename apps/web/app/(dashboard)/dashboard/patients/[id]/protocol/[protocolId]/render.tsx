/* eslint-disable @typescript-eslint/no-explicit-any */
// Generic renderer for the JSONB protocol content. The shapes are defined by
// prompts/protocol_generation_v1.md; we render defensively so schema drift
// doesn't crash the page while the protocol editor is being built.

function titleize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  // object
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

export function ProtocolSection({
  title,
  content,
}: {
  title: string;
  content: unknown;
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
        {title}
      </h3>
      <div className="text-sm text-ink-muted">
        <RenderValue value={content} />
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
          <ProtocolSection key={k} title={titleize(k)} content={content[k]} />
        ))}
    </div>
  );
}
