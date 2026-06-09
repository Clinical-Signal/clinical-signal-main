"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { SaveStatus } from "./shared";

type StepOneSaveContextValue = {
  saveStatus: SaveStatus;
  reportSaveStatus: (status: SaveStatus) => void;
};

const StepOneSaveContext = createContext<StepOneSaveContextValue | null>(null);

export function StepOneSaveProvider({ children }: { children: React.ReactNode }) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const reportSaveStatus = useCallback((status: SaveStatus) => {
    setSaveStatus(status);
  }, []);

  const value = useMemo(
    () => ({ saveStatus, reportSaveStatus }),
    [reportSaveStatus, saveStatus],
  );

  return (
    <StepOneSaveContext.Provider value={value}>{children}</StepOneSaveContext.Provider>
  );
}

export function useStepOneSaveContext(): StepOneSaveContextValue {
  const context = useContext(StepOneSaveContext);
  if (!context) {
    throw new Error("useStepOneSaveContext must be used within StepOneSaveProvider");
  }
  return context;
}
