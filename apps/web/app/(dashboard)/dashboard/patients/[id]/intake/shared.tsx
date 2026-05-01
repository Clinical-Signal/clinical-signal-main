"use client";

import { useEffect, useRef, useState } from "react";
import type { IntakeSectionKey } from "@/lib/intake-schema";
import { saveSectionAction } from "./actions";

export const SAVE_DEBOUNCE_MS = 1500;

// ---------------------------------------------------------------------------
// Shared auto-save hook
// ---------------------------------------------------------------------------

export function useDebouncedSave<T>(
  patientId: string,
  section: IntakeSectionKey,
  value: T,
  initialSavedAt: string | null = null,
) {
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const skipFirst = useRef(true);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      setSaving(true);
      setError(null);
      try {
        const res = await saveSectionAction(patientId, section, valueRef.current);
        if (res.ok) setSavedAt(res.savedAt);
        else setError(res.error);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [patientId, section, value]);

  return { savedAt, saving, error };
}

// ---------------------------------------------------------------------------
// Section chrome
// ---------------------------------------------------------------------------

export function SectionShell({
  title,
  description,
  status,
  children,
}: {
  title: string;
  description?: string;
  status: { saving: boolean; savedAt: string | null; error: string | null };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <div>
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>
          ) : null}
        </div>
        <SaveStatus {...status} />
      </header>
      <div className="flex flex-col gap-4 px-6 py-5">{children}</div>
    </section>
  );
}

function SaveStatus({
  saving,
  savedAt,
  error,
}: {
  saving: boolean;
  savedAt: string | null;
  error: string | null;
}) {
  if (error)
    return (
      <span role="alert" className="text-xs text-danger">Couldn&apos;t save: {error}</span>
    );
  if (saving)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-subtle">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        Saving…
      </span>
    );
  if (savedAt)
    return (
      <span className="text-xs text-ink-subtle">
        Saved {new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </span>
    );
  return <span className="text-xs text-ink-faint">Not yet saved</span>;
}

// ---------------------------------------------------------------------------
// Shared form atoms
// ---------------------------------------------------------------------------

export const inputClass =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-faint " +
  "transition-colors focus:border-accent focus:outline-none focus-visible:shadow-focus " +
  "disabled:bg-surface-sunken disabled:text-ink-subtle";

export const labelClass = "text-xs font-medium uppercase tracking-wide text-ink-subtle";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <input
        className={inputClass}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <input
        className={inputClass}
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Number(v));
        }}
      />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: { value: T | ""; label: string }[];
  onChange: (v: T | "") => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <select
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value as T | "")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <textarea
        className={inputClass}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function SliderField({
  label,
  value,
  onChange,
  min = 1,
  max = 10,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>
        {label} <span className="ml-2 text-ink">{value ?? "—"}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value ?? min}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function RemoveButton({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? "Remove item"}
      className="self-start text-xs text-danger transition-colors hover:text-danger/80"
    >
      Remove
    </button>
  );
}

export function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start rounded-md border border-dashed border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-sunken"
    >
      + {children}
    </button>
  );
}
