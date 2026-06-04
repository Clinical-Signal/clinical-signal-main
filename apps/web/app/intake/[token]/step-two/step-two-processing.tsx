"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { QuestionPlanResolved } from "@/lib/intake/schemas/question-plan.schema";

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
          console.error("[step-two-processing] analyze_fetch_failed", error);
          setState("error");
        }
        return;
      }

      if (cancelled) {
        return;
      }

      if (response.status >= 500) {
        console.error(
          "[step-two-processing] analyze_server_error",
          response.status,
        );
        setState("error");
        return;
      }

      if (!response.ok) {
        console.error(
          "[step-two-processing] analyze_client_error",
          response.status,
        );
        setState("error");
        return;
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (!cancelled) {
          console.error("[step-two-processing] analyze_json_failed", error);
          setState("error");
        }
        return;
      }

      const parsed = QuestionPlanResolved.safeParse(body);
      if (!parsed.success) {
        console.error(
          "[step-two-processing] analyze_plan_invalid",
          parsed.error.flatten(),
        );
        setState("error");
        return;
      }

      console.error("[step-two-processing] analyze_ok", {
        analysisDegraded: parsed.data.analysis_degraded,
        moduleCount: parsed.data.question_plan.length,
      });

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
