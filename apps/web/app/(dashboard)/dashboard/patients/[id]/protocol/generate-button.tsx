"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

interface StreamEvent {
  status?: string;
  detail?: string;
  done?: boolean;
  analysisId?: string;
  protocolId?: string;
  redirect?: string;
  error?: string;
}

async function readStream(
  url: string,
  opts: RequestInit,
  onEvent: (evt: StreamEvent) => void,
): Promise<StreamEvent | null> {
  const res = await fetch(url, opts);
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Server returned " + res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last: StreamEvent | null = null;

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
        last = evt;
        onEvent(evt);
        if (evt.error) throw new Error(evt.error);
      } catch (e) {
        if (e instanceof Error && e.message) throw e;
      }
    }
  }
  return last;
}

export function GenerateProtocolButton({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<string>("Starting...");
  const [status, setStatus] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setPending(true);
    setError(null);
    setPhase("Step 1 of 2");
    setStatus("Analyzing patient data...");
    setDetail(null);

    try {
      const analyzeResult = await readStream(
        "/api/patients/" + patientId + "/analyze",
        { method: "POST" },
        (evt) => {
          if (evt.status) setStatus(evt.status);
          if (evt.detail) setDetail(evt.detail);
        },
      );

      const analysisId = analyzeResult?.analysisId as string | undefined;
      if (!analysisId) {
        throw new Error("Analysis completed but no ID was returned.");
      }

      setPhase("Step 2 of 2");
      setStatus("Drafting protocol and action plan...");
      setDetail(null);

      const protoResult = await readStream(
        "/api/patients/" + patientId + "/generate-from-analysis",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysisId }),
        },
        (evt) => {
          if (evt.status) setStatus(evt.status);
          if (evt.detail) setDetail(evt.detail);
        },
      );

      if (protoResult?.redirect) {
        setPhase("Done");
        setStatus("Opening protocol...");
        router.push(protoResult.redirect);
        router.refresh();
      } else {
        throw new Error("Protocol generated but no redirect was returned.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }, [patientId, router]);

  return (
    <div className="flex flex-col gap-2">
      <Button
        loading={pending}
        loadingText={phase}
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
            Each step takes 15–30 seconds.
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
