"use client";

import { useEffect } from "react";
import { Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

// Dashboard-wide error boundary. Next wraps every dashboard page in this;
// anything that throws on the server renders here with a reset handler.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Best-effort client log. In prod we wire this to an error reporter;
    // for now the digest is enough to cross-reference server logs.
    // eslint-disable-next-line no-console
    console.error("dashboard error", error);
  }, [error]);

  return (
    <Page>
      <PageHeader
        eyebrow="Something went wrong"
        title="We couldn't load this page"
        description="The problem was on our side. Try again — most hiccups resolve on a retry. If this keeps happening, sign out and back in."
      />
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <a
            href="/dashboard"
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Back to patients
          </a>
        </div>
        {error.digest ? (
          <p className="text-xs text-ink-subtle">
            Reference: <span className="font-mono text-ink-muted">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </Page>
  );
}
