export function IntakeLinkExpired() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-canvas px-6 py-10">
      <div className="space-y-4 rounded-lg border border-line bg-surface p-6 text-center shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Clinical Signal
        </p>
        <h1 className="font-serif text-2xl text-ink">Link expired or invalid</h1>
        <p className="text-base leading-relaxed text-ink-muted">
          This intake link is no longer available. It may have already been used, expired, or
          replaced with a new link.
        </p>
        <p className="text-sm text-ink-muted">
          Please request a new link from your provider.
        </p>
      </div>
    </div>
  );
}
