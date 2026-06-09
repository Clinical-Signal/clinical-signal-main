type PageProps = {
  params: { token: string };
};

export default function IntakeCompletePage(_props: PageProps) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-canvas px-6 py-10">
      <div className="space-y-4 rounded-lg border border-line bg-surface p-6 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Clinical Signal
        </p>
        <h1 className="font-serif text-2xl text-ink">Thank you</h1>
        <p className="text-base leading-relaxed text-ink-muted">
          Your intake has been submitted. Your practitioner will review your answers.
          This link is no longer active.
        </p>
      </div>
    </div>
  );
}
