import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-8 py-16 text-center">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
        403
      </div>
      <h1 className="text-2xl font-medium text-ink">Access denied</h1>
      <p className="max-w-sm text-sm text-ink-muted">
        Your account does not have permission to view this page. If you believe
        this is a mistake, contact your practice administrator.
      </p>
      <div>
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
