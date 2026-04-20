"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface StreamEvent {
  step?: number;
  total?: number;
  status?: string;
  detail?: string;
  done?: boolean;
  protocolId?: string;
  redirect?: string;
  error?: string;
}

export function GenerateProtocolButton({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [step, setStep] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setError(null);
    setStatus("Starting...");
    setStep(null);
    setDetail(null);

    try {
      const res = await fetch(`/api/patients/${patientId}/generate-protocol`, {
        method: "POST",
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        setError(text || `Server returned ${res.status}`);
        setPending(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt: StreamEvent = JSON.parse(line);
            if (evt.error) {
              setError(evt.error);
              setPending(false);
              return;
            }
            if (evt.status) setStatus(evt.status);
            if (evt.detail) setDetail(evt.detail);
            if (evt.step && evt.total) setStep({ current: evt.step, total: evt.total });
            if (evt.done && evt.redirect) {
              setStatus("Done — opening protocol...");
              router.push(evt.redirect);
              router.refresh();
              return;
            }
          } catch {
            // ignore malformed lines
          }
        }
      }

      setPending(false);
      if (!error) setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        loading={pending}
        loadingText={step ? `Step ${step.current}/${step.total}` : "Starting..."}
        onClick={generate}
        className="self-start"
      >
        Generate protocol
      </Button>
      {pending && status ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-sm text-ink-muted">{status}</p>
          {detail ? (
            <p className="text-xs text-ink-subtle">{detail}</p>
          ) : null}
          <p className="text-xs text-ink-faint">
            This typically takes 30–60 seconds. You can leave the page open.
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-danger">
          Couldn&apos;t generate protocol: {error}
        </p>
      ) : null}
    </div>
  );
}
