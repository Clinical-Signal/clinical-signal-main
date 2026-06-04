"use client";

import { useCallback, useState } from "react";

import type {
  SynthesisApiError,
  SynthesisApiSuccess,
  SynthesisState,
} from "./clinical-synthesis-types";

type UseClinicalSynthesisGenerateResult = {
  state: SynthesisState;
  result: SynthesisApiSuccess | null;
  errorMessage: string | null;
  generateDraft: () => Promise<void>;
};

export function useClinicalSynthesisGenerate(
  token: string,
  initialResult: SynthesisApiSuccess | null,
): UseClinicalSynthesisGenerateResult {
  const [state, setState] = useState<SynthesisState>(
    initialResult ? "success" : "idle",
  );
  const [result, setResult] = useState<SynthesisApiSuccess | null>(initialResult);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const generateDraft = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);

    let response: Response;
    try {
      response = await fetch(
        `/api/clinician/intake/${encodeURIComponent(token)}/synthesize`,
        { method: "POST" },
      );
    } catch {
      setState("error");
      setErrorMessage(
        "Could not reach the server. Check your connection and try again.",
      );
      return;
    }

    let payload: SynthesisApiSuccess | SynthesisApiError;
    try {
      payload = (await response.json()) as SynthesisApiSuccess | SynthesisApiError;
    } catch {
      setState("error");
      setErrorMessage("Received an invalid response from the server.");
      return;
    }

    if (!response.ok) {
      setState("error");
      const err = payload as SynthesisApiError;
      setErrorMessage(
        err.message ??
          "Clinical synthesis failed or was degraded. The AI service may be unavailable — try again shortly.",
      );
      return;
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      !("synthesis" in payload) ||
      !payload.synthesis?.clinical_summary
    ) {
      setState("error");
      setErrorMessage("Synthesis completed but the response was incomplete.");
      return;
    }

    setResult(payload as SynthesisApiSuccess);
    setState("success");
  }, [token]);

  return { state, result, errorMessage, generateDraft };
}
