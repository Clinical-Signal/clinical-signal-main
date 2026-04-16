import * as React from "react";
import { cn } from "@/lib/cn";

/** Page shell — consistent max-width and gutters across all dashboard pages. */
export function Page({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1200px] px-4 sm:px-8 py-8", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4 pb-6", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-subtle">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-2xl font-medium text-ink">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-prose text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
