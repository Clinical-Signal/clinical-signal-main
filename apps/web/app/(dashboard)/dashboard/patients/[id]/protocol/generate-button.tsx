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

  // Flush any remaining data in the buffer after the stream closes.
  // The final event can land here if the server closes the stream
  // immediately after enqueuing the last chunk.
  if (buffer.trim()) {
    try {
      const evt: StreamEvent = JSON.parse(buffer);
      last = evt;
      onEvent(evt);
      if (evt.error) throw new Error(evt.error);
    } catch (e) {
      if (e instanceof Error && e.message) throw e;
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

      let redirectUrl: string | null = null;

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
          if (evt.redirect) redirectUrl = evt.redirect;
          if (evt.protocolId && !redirectUrl) {
            redirectUrl = "/dashboard/patients/" + patientId + "/protocol/" + evt.protocolId;
          }
        },
      );

      // Use redirect from event callback (most reliable) or return value.
      let target =
        redirectUrl ??
        protoResult?.redirect ??
        (protoResult?.protocolId
          ? "/dashboard/patients/" + patientId + "/protocol/" + protoResult.protocolId
          : null);

      // Fallback: if the stream ended without a redirect (e.g. Vercel
      // timeout killed the function mid-generation), poll to check if a
      // protocol was actually created in the background.
      if (!target) {
        setStatus("Checking for generated protocol...");
        for (let attempt = 0; attempt < 6; attempt++) {
          await new Promise((r) => setTimeout(r, 5000));
          try {
            const checkRes = await fetch(
              "/api/patients/" + patientId + "/protocols?limit=1",
            );
            if (checkRes.ok) {
              const protocols = await checkRes.json();
              if (protocols.length > 0) {
                const latest = protocols[0];
                // Only use it if created recently (within last 10 minutes)
                const age = Date.now() - new Date(latest.createdAt).getTime();
                if (age < 10 * 60 * 1000) {
                  target = "/dashboard/patients/" + patientId + "/protocol/" + latest.id;
                  break;
                }
              }
            }
          } catch { /* retry */ }
          setStatus("Still checking... (" + (attempt + 1) + "/6)");
        }
      }

      if (target) {
        setPhase("Done");
        setStatus("Opening protocol...");
        router.push(target);
        router.refresh();
      } else {
        throw new Error(
          "Protocol generation may still be running. Wait a minute, " +
          "then refresh this page to check the versions list.",
        );
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
