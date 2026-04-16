import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-8 py-16 text-center">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
        404
      </div>
      <h1 className="text-2xl font-medium text-ink">Not here</h1>
      <p className="max-w-sm text-sm text-ink-muted">
        The page you&apos;re looking for doesn&apos;t exist, or you don&apos;t
        have access to it. If you followed a link from somewhere in the app,
        this is a bug worth reporting.
      </p>
      <div>
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
        >
          Back to patients
        </Link>
      </div>
    </main>
  );
}
