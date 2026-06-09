import Link from "next/link";

type StepTwoChatHeaderProps = {
  token: string;
};

export function StepTwoChatHeader({ token }: StepTwoChatHeaderProps) {
  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur-sm">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Step 2
        </p>
        <h1 className="truncate font-serif text-lg text-ink">Clinical Assistant</h1>
      </div>
      <p className="mt-1 text-center text-xs text-ink-subtle">
        <Link
          href={`/intake/${encodeURIComponent(token)}/step-one`}
          className="underline underline-offset-2 hover:text-ink-muted"
        >
          Back to Step 1
        </Link>
      </p>
    </header>
  );
}
