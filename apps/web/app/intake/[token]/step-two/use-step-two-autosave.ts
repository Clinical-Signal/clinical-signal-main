"use client";

import { useCallback, useRef, useState } from "react";

import { postStepTwoSection, type StepTwoSaveStatus } from "./post-step-two-section";

export function useStepTwoAutosave(
  token: string,
  onAnswersSynced: (answers: Record<string, unknown>) => void,
) {
  const [saveStatus, setSaveStatus] = useState<StepTwoSaveStatus>("idle");
  const saveGenerationRef = useRef(0);

  const saveAnswers = useCallback(
    async (draft: Record<string, unknown>) => {
      const generation = ++saveGenerationRef.current;
      setSaveStatus("saving");

      const result = await postStepTwoSection(token, draft);
      if (!result.ok) {
        if (generation === saveGenerationRef.current) {
          setSaveStatus("error");
        }
        return;
      }

      if (generation !== saveGenerationRef.current) {
        return;
      }

      onAnswersSynced(draft);
      setSaveStatus("saved");
      window.setTimeout(() => {
        if (generation === saveGenerationRef.current) {
          setSaveStatus("idle");
        }
      }, 2000);
    },
    [token, onAnswersSynced],
  );

  return { saveStatus, saveAnswers, saveGenerationRef };
}
