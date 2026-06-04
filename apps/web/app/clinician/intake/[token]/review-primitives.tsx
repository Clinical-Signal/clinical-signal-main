export function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="border-b border-line px-5 py-3 sm:px-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
          {title}
        </h2>
      </header>
      <div className="flex flex-col gap-4 px-5 py-5 text-sm sm:px-6">{children}</div>
    </section>
  );
}

export function ReviewField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-ink">
        {value ?? <span className="text-ink-faint">—</span>}
      </dd>
    </div>
  );
}
