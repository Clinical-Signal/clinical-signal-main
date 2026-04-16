"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { generateProtocolAction } from "./actions";

export function GenerateProtocolButton({ patientId }: { patientId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        loading={pending}
        loadingText="Generating protocol…"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await generateProtocolAction(patientId);
            if (res && !res.ok) setError(res.error);
          });
        }}
        className="self-start"
      >
        Generate protocol
      </Button>
      {pending ? (
        <p className="text-xs text-ink-subtle">
          Analyzing intake + lab records, then drafting both outputs.
          Typically takes 30–60 seconds — you can leave the page open.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger">
          Couldn&apos;t generate protocol: {error}
        </p>
      ) : null}
    </div>
  );
}
