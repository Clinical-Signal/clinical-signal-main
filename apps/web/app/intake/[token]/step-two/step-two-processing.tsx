"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ProcessingState = "loading" | "error";

type StepTwoProcessingProps = {
  token: string;
};

export function StepTwoProcessing({ token }: StepTwoProcessingProps) {
  const router = useRouter();
  const [state, setState] = useState<ProcessingState>("loading");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function runAnalyze() {
      setState("loading");

      let response: Response;
      try {
        response = await fetch(
          `/api/intake/${encodeURIComponent(token)}/analyze`,
          { method: "POST" },
        );
      } catch (error) {
        if (!cancelled) {
          console.error("[step-two-processing] analyze fetch failed", error);
          setState("error");
        }
        return;
      }

      if (cancelled) {
        return;
      }

      if (response.status >= 500) {
        console.error(
          "[step-two-processing] analyze server error",
          response.status,
        );
        setState("error");
        return;
      }

      if (!response.ok) {
        console.error(
          "[step-two-processing] analyze client error",
          response.status,
        );
        setState("error");
        return;
      }

      try {
        const payload = (await response.json()) as {
          question_plan?: unknown;
        };
        if (!Array.isArray(payload.question_plan)) {
          console.error(
            "[step-two-processing] analyze response missing question_plan",
          );
          setState("error");
          return;
        }
      } catch (error) {
        if (!cancelled) {
          console.error(
            "[step-two-processing] analyze response parse failed",
            error,
          );
          setState("error");
        }
        return;
      }

      router.refresh();
    }

    void runAnalyze();

    return () => {
      cancelled = true;
    };
  }, [token, router, retryKey]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-canvas px-4 py-8">
      <div className="space-y-4 text-center">
        <h1 className="font-serif text-xl text-ink">Preparing your questions</h1>
        {state === "loading" ? (
          <p className="text-sm text-ink-muted">
            We are reviewing your Step 1 answers to personalize follow-up questions. This
            usually takes a few seconds.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-muted" role="alert">
              We could not prepare your question plan. Check your connection and try again.
            </p>
            <button
              type="button"
              className="min-h-12 w-full rounded-md bg-accent px-4 text-base font-medium text-ink-inverse"
              onClick={() => setRetryKey((key) => key + 1)}
            >
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
