"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";

import { useStepOneSaveContext } from "./step-one-save-context";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type StepOneSectionKey =
  | "about_you"
  | "why_here"
  | "symptoms"
  | "history"
  | "medications"
  | "lifestyle"
  | "hormones"
  | "previous_labs"
  | "wearables"
  | "anything_else";

export const inputClass =
  "min-h-12 w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 py-3 text-base text-ink " +
  "placeholder:text-ink-faint focus:border-accent focus:outline-none focus-visible:shadow-focus";

export const textareaClass =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-3 text-base text-ink " +
  "placeholder:text-ink-faint focus:border-accent focus:outline-none focus-visible:shadow-focus";

export const labelClass = "text-sm font-medium text-ink";

export const sublabelClass = "text-xs font-medium uppercase tracking-wide text-ink-subtle";

export async function postIntakeSection<T>(
  token: string,
  section: StepOneSectionKey,
  data: T,
): Promise<{ ok: true; savedAt: string } | { ok: false }> {
  const response = await fetch(`/api/intake/${encodeURIComponent(token)}/section`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section, data }),
  });

  if (!response.ok) {
    return { ok: false };
  }

  const payload = (await response.json()) as { savedAt?: string };
  return { ok: true, savedAt: payload.savedAt ?? new Date().toISOString() };
}

export function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") {
    return null;
  }

  const label =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : "Could not save";

  const tone = status === "error" ? "text-warning" : "text-ink-subtle";

  return (
    <p className={`shrink-0 text-xs font-medium ${tone}`} aria-live="polite">
      {label}
    </p>
  );
}

export function useSectionBlurSave<T>({
  token,
  section,
  value,
  schema,
  onSynced: _onSynced,
  debounceMs = 750,
}: {
  token: string;
  section: StepOneSectionKey;
  value: T;
  schema: z.ZodType<T>;
  onSynced?: (next: T) => void;
  debounceMs?: number;
}) {
  const { reportSaveStatus } = useStepOneSaveContext();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const skipNextAutosave = useRef(true);
  const lastSavedJson = useRef<string | null>(null);
  const saveGeneration = useRef(0);

  const updateSaveStatus = useCallback(
    (status: SaveStatus) => {
      setSaveStatus(status);
      reportSaveStatus(status);
    },
    [reportSaveStatus],
  );

  const saveValue = useCallback(
    async (payload: T) => {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        return;
      }

      const serialized = JSON.stringify(parsed.data);
      if (serialized === lastSavedJson.current) {
        return;
      }

      const generation = ++saveGeneration.current;
      updateSaveStatus("saving");
      const result = await postIntakeSection(token, section, parsed.data);
      if (generation !== saveGeneration.current) {
        return;
      }

      if (!result.ok) {
        updateSaveStatus("error");
        return;
      }

      lastSavedJson.current = serialized;
      updateSaveStatus("saved");
      window.setTimeout(() => {
        if (generation === saveGeneration.current) {
          updateSaveStatus("idle");
        }
      }, 2000);
    },
    [schema, section, token, updateSaveStatus],
  );

  const saveOnBlur = useCallback(() => saveValue(value), [saveValue, value]);

  useEffect(() => {
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      const parsed = schema.safeParse(value);
      if (parsed.success) {
        lastSavedJson.current = JSON.stringify(parsed.data);
      }
      return;
    }

    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveValue(parsed.data);
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [debounceMs, saveValue, schema, value]);

  return { saveStatus, saveOnBlur, saveValue };
}

export function ScreenHeader({
  title,
  description,
  saveStatus,
}: {
  title: string;
  description: string;
  saveStatus: SaveStatus;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      </div>
      <SaveIndicator status={saveStatus} />
    </div>
  );
}

export function IntroBanner() {
  return (
    <p className="mb-6 rounded-md border border-line bg-surface-sunken px-4 py-3 text-sm text-ink-muted">
      Please set aside 15–20 minutes to complete this intake thoughtfully. Your answers
      autosave as you type.
    </p>
  );
}
