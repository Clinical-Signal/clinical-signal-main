import * as React from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "warning" | "success" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-muted",
  accent: "bg-accent-soft text-accent",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: {
  tone?: Tone;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Subtle 6px dot used for list-row status indicators — a quieter
 *  alternative to Badge in dense layouts. */
export function StatusDot({
  tone = "neutral",
  className,
}: {
  tone?: Tone;
  className?: string;
}) {
  const color: Record<Tone, string> = {
    neutral: "bg-ink-faint",
    accent: "bg-accent",
    warning: "bg-warning",
    success: "bg-success",
    danger: "bg-danger",
  };
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        color[tone],
        className,
      )}
    />
  );
}
