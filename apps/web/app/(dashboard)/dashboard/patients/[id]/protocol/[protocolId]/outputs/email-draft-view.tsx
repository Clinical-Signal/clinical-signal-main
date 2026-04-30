"use client";

import { useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function EmailDraftView({ content }: { content: Record<string, unknown> }) {
  const c = content as any;
  const [copied, setCopied] = useState(false);

  const fullText = [c.body, "", c.closing, "", c.disclaimer_footer]
    .filter(Boolean)
    .join("\n");

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = fullText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const mailtoBody = encodeURIComponent(fullText);
  const mailtoSubject = encodeURIComponent(c.subject_line ?? "Your health plan");
  const mailtoHref = `mailto:?subject=${mailtoSubject}&body=${mailtoBody}`;

  return (
    <article className="rounded-xl border border-line bg-surface p-6">
      {/* Subject line */}
      {c.subject_line && (
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
            Subject
          </p>
          <p className="mt-1 text-base font-semibold text-ink">
            {c.subject_line}
          </p>
        </div>
      )}

      {/* Email body */}
      <div className="mb-4 rounded-lg border border-line bg-surface-sunken/30 p-5">
        {c.body && (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
            {c.body}
          </div>
        )}
        {c.closing && (
          <p className="mt-4 text-sm text-ink-muted">{c.closing}</p>
        )}
      </div>

      {/* Disclaimer */}
      {c.disclaimer_footer && (
        <p className="mb-4 text-xs text-ink-faint">{c.disclaimer_footer}</p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={copyToClipboard}
          className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
        >
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>
        <a
          href={mailtoHref}
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent-hover"
        >
          Open in email client
        </a>
      </div>
    </article>
  );
}
