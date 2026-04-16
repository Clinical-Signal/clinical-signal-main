export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Clinical Signal
        </div>
        <h1 className="font-serif text-[28px] leading-tight text-ink">
          Clinical tools for functional health.
        </h1>
      </div>
      {children}
    </main>
  );
}
