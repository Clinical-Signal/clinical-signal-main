"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatForEMR } from "@/lib/intake/format-emr-export";
import type { SynthesisResolved } from "@/lib/intake/schemas/synthesis-resolved.schema";

type CopyEmrButtonProps = {
  synthesis: SynthesisResolved;
};

function CheckIcon() {
  return (
    <svg
      aria-hidden
      className="h-4 w-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 8.5L6.5 12L13 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CopyEmrButton({ synthesis }: CopyEmrButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  const copyToEmr = useCallback(async () => {
    const text = formatForEMR(synthesis);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
      resetTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [synthesis]);

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => void copyToEmr()}
      aria-live="polite"
      className={copied ? "min-w-[8.5rem]" : undefined}
    >
      {copied ? (
        <span className="inline-flex items-center gap-2">
          <CheckIcon />
          Copied!
        </span>
      ) : (
        "Copy to EMR"
      )}
    </Button>
  );
}
