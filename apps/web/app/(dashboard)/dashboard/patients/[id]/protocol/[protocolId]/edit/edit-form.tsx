"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  changeProtocolStatus,
  regenerateProtocol,
  saveProtocolEdits,
} from "./actions";

type Status = "draft" | "review" | "finalized" | "approved" | "superseded";

interface VersionRow {
  id: string;
  version: number;
  status: string;
  createdAt: string;
}

interface Props {
  patientId: string;
  protocolId: string;
  initialTitle: string;
  initialStatus: Status;
  initialVersion: number;
  initialClinical: Record<string, any>;
  initialClient: Record<string, any>;
  versions: VersionRow[];
}

const inputClass =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink " +
  "transition-colors focus:border-accent focus:outline-none focus-visible:shadow-focus";
const labelClass =
  "text-xs font-medium uppercase tracking-wide text-ink-subtle";

export function EditForm(props: Props) {
  const router = useRouter();
  const initialClinicalStripped = useMemo(
    () => stripGen(props.initialClinical),
    [props.initialClinical],
  );
  const [title, setTitle] = useState(props.initialTitle);
  const [status, setStatus] = useState<Status>(props.initialStatus);
  const [clinical, setClinical] = useState(initialClinicalStripped);
  const [client, setClient] = useState(props.initialClient);
  const [saving, startSave] = useTransition();
  const [statusSaving, startStatus] = useTransition();
  const [regenerating, startRegen] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track whether anything has been edited since the snapshot landed; lets
  // the toolbar show a calm "Edited" pill rather than a noisy diff badge.
  const dirty = useMemo(() => {
    return (
      title !== props.initialTitle ||
      JSON.stringify(clinical) !== JSON.stringify(initialClinicalStripped) ||
      JSON.stringify(client) !== JSON.stringify(props.initialClient)
    );
  }, [
    title,
    clinical,
    client,
    props.initialTitle,
    props.initialClient,
    initialClinicalStripped,
  ]);

  // Warn before navigating away with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Auto-save to localStorage every 30s when dirty, so browser crashes
  // don't lose work. Cleared on successful server save.
  const storageKey = "protocol_draft_" + props.protocolId;
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    // On mount, check for a stored draft and offer to restore.
    if (restored) return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const draft = JSON.parse(stored) as {
          title: string;
          clinical: Record<string, any>;
          client: Record<string, any>;
          savedAt: string;
        };
        if (
          draft.title !== props.initialTitle ||
          JSON.stringify(draft.clinical) !== JSON.stringify(initialClinicalStripped) ||
          JSON.stringify(draft.client) !== JSON.stringify(props.initialClient)
        ) {
          const age = Date.now() - new Date(draft.savedAt).getTime();
          if (age < 24 * 60 * 60 * 1000) {
            // Less than 24h old — restore silently.
            setTitle(draft.title);
            setClinical(draft.clinical);
            setClient(draft.client);
            setAutoSavedAt(draft.savedAt);
            setMessage("Restored unsaved edits from " + new Date(draft.savedAt).toLocaleTimeString());
          } else {
            localStorage.removeItem(storageKey);
          }
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    } catch { /* ignore */ }
    setRestored(true);
  }, [storageKey, restored, props.initialTitle, props.initialClient, initialClinicalStripped]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      try {
        const draft = { title, clinical, client, savedAt: new Date().toISOString() };
        localStorage.setItem(storageKey, JSON.stringify(draft));
        setAutoSavedAt(draft.savedAt);
      } catch { /* quota exceeded etc */ }
    }, 30_000);
    return () => clearTimeout(timer);
  }, [dirty, title, clinical, client, storageKey]);

  function onSave() {
    setMessage(null);
    setError(null);
    startSave(async () => {
      const res = await saveProtocolEdits(
        props.patientId,
        props.protocolId,
        title,
        clinical,
        client,
      );
      if (res.ok) {
        try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
        setAutoSavedAt(null);
        setMessage(`Saved as v${res.version}.`);
        router.push(
          `/dashboard/patients/${props.patientId}/protocol/${res.protocolId}/edit`,
        );
      } else {
        setError(res.error);
      }
    });
  }

  function onStatus(next: Status) {
    setStatus(next);
    setMessage(null);
    setError(null);
    startStatus(async () => {
      const res = await changeProtocolStatus(
        props.patientId,
        props.protocolId,
        next,
      );
      if (!res.ok) setError(res.error);
      else setMessage(`Status set to ${next}.`);
    });
  }

  function onRegenerate() {
    if (!confirm("Re-run protocol generation? This creates a new version.")) return;
    setMessage(null);
    setError(null);
    startRegen(async () => {
      const res = await regenerateProtocol(props.patientId, props.protocolId);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        title={title}
        onTitleChange={setTitle}
        status={status}
        onStatusChange={onStatus}
        statusSaving={statusSaving}
        onSave={onSave}
        saving={saving}
        onRegenerate={onRegenerate}
        regenerating={regenerating}
        currentVersion={props.initialVersion}
        versions={props.versions}
        currentId={props.protocolId}
        patientId={props.patientId}
        dirty={dirty}
        autoSavedAt={autoSavedAt}
      />
      <TruncationWarning generation={props.initialClinical?._generation} />
      {message ? (
        <p className="text-sm text-success">{message}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelWithPreview
          title="Output A · Clinical protocol"
          subtitle="Practitioner copy"
          tone="surface"
          editor={<ClinicalEditor value={clinical} onChange={setClinical} original={initialClinicalStripped} />}
          preview={<JsonPreview data={clinical} />}
        />
        <PanelWithPreview
          title="Output B · Client action plan"
          subtitle="Patient copy"
          tone="sunken"
          editor={<ClientEditor value={client} onChange={setClient} original={props.initialClient} />}
          preview={<JsonPreview data={client} />}
        />
      </div>
    </div>
  );
}

function stripGen(obj: Record<string, any>): Record<string, any> {
  // _generation is engine bookkeeping; don't expose it for editing.
  if (!obj || typeof obj !== "object") return obj;
  const { _generation, ...rest } = obj;
  return rest;
}

function Panel({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string;
  subtitle?: string;
  tone: "surface" | "sunken";
  children: React.ReactNode;
}) {
  const bg = tone === "surface" ? "bg-surface" : "bg-surface-sunken/40";
  return (
    <article className={`rounded-xl border border-line ${bg} p-6`}>
      <header className="mb-4 border-b border-line pb-3">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-xs text-ink-subtle">{subtitle}</p>
        ) : null}
      </header>
      <div className="flex flex-col gap-5">{children}</div>
    </article>
  );
}

function PanelWithPreview({
  title,
  subtitle,
  tone,
  editor,
  preview,
}: {
  title: string;
  subtitle?: string;
  tone: "surface" | "sunken";
  editor: React.ReactNode;
  preview: React.ReactNode;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const bg = tone === "surface" ? "bg-surface" : "bg-surface-sunken/40";
  return (
    <article className={`rounded-xl border border-line ${bg} p-6`}>
      <header className="mb-4 flex items-start justify-between border-b border-line pb-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-ink-subtle">{subtitle}</p> : null}
        </div>
        <div className="flex rounded-md border border-line-strong">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={`rounded-l-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === "edit"
                ? "bg-surface text-ink"
                : "text-ink-subtle hover:text-ink"
            }`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`rounded-r-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === "preview"
                ? "bg-surface text-ink"
                : "text-ink-subtle hover:text-ink"
            }`}
          >
            Preview
          </button>
        </div>
      </header>
      <div className="flex flex-col gap-5">
        {mode === "edit" ? editor : preview}
      </div>
    </article>
  );
}

function JsonPreview({ data }: { data: Record<string, any> }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      {Object.entries(data).map(([key, value]) => {
        if (key.startsWith("_")) return null;
        return (
          <div key={key}>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-subtle">
              {key.replace(/_/g, " ")}
            </h3>
            <div className="text-ink-muted">
              <RenderPreviewValue value={value} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RenderPreviewValue({ value }: { value: unknown }): React.ReactElement {
  if (value === null || value === undefined) {
    return <span className="text-ink-faint">\u2014</span>;
  }
  if (typeof value === "string") {
    return <p className="whitespace-pre-wrap leading-relaxed">{value}</p>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-ink-faint">(none)</span>;
    const allPrimitive = value.every(
      (v) => v === null || ["string", "number", "boolean"].includes(typeof v),
    );
    if (allPrimitive) {
      return (
        <ul className="ml-4 list-disc space-y-0.5">
          {value.map((v, i) => (
            <li key={i}>{String(v)}</li>
          ))}
        </ul>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {value.map((v, i) => (
          <div key={i} className="rounded-lg border border-line bg-surface/60 p-2">
            <RenderPreviewValue value={v} />
          </div>
        ))}
      </div>
    );
  }
  // object
  const obj = value as Record<string, unknown>;
  return (
    <dl className="flex flex-col gap-1.5 pl-2">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium text-ink-subtle">{k.replace(/_/g, " ")}</dt>
          <dd className="text-sm"><RenderPreviewValue value={v} /></dd>
        </div>
      ))}
    </dl>
  );
}

function Toolbar({
  title,
  onTitleChange,
  status,
  onStatusChange,
  statusSaving,
  onSave,
  saving,
  onRegenerate,
  regenerating,
  currentVersion,
  versions,
  currentId,
  patientId,
  dirty,
  autoSavedAt,
}: {
  title: string;
  onTitleChange: (v: string) => void;
  status: Status;
  onStatusChange: (s: Status) => void;
  statusSaving: boolean;
  onSave: () => void;
  saving: boolean;
  onRegenerate: () => void;
  regenerating: boolean;
  currentVersion: number;
  versions: VersionRow[];
  currentId: string;
  patientId: string;
  dirty: boolean;
  autoSavedAt: string | null;
}) {
  const router = useRouter();
  return (
    <div className="sticky top-14 z-[5] flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface/95 p-4 backdrop-blur">
      <label className="flex min-w-[260px] flex-1 flex-col gap-1.5">
        <span className={labelClass}>Title</span>
        <input
          className={inputClass}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Status (v{currentVersion})</span>
        <select
          className={`${inputClass} h-10`}
          value={status}
          disabled={statusSaving}
          onChange={(e) => onStatusChange(e.target.value as Status)}
        >
          <option value="draft">Draft</option>
          <option value="review">Review</option>
          <option value="finalized">Finalized</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Version</span>
        <select
          className={`${inputClass} h-10`}
          value={currentId}
          onChange={(e) => {
            const id = e.target.value;
            router.push(
              `/dashboard/patients/${patientId}/protocol/${id}/edit`,
            );
          }}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.version} — {v.status} — {new Date(v.createdAt).toLocaleDateString()}
            </option>
          ))}
        </select>
      </label>
      <div className="ml-auto flex items-center gap-2">
        {dirty ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-warning-soft px-2 py-1 text-xs font-medium text-warning">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
            Unsaved changes
          </span>
        ) : autoSavedAt ? (
          <span className="text-xs text-ink-faint">
            Auto-saved {new Date(autoSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
        ) : null}
        <Button
          variant="secondary"
          loading={regenerating}
          loadingText="Regenerating…"
          onClick={onRegenerate}
          title="Re-run protocol generation against the linked analysis"
        >
          Regenerate
        </Button>
        <Button
          loading={saving}
          loadingText="Saving…"
          onClick={onSave}
        >
          Save as new version
        </Button>
        <a
          href={`/api/patients/${patientId}/protocol/${currentId}/export?audience=clinical`}
          target="_blank"
          rel="noopener"
          className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-2 text-xs text-ink-subtle transition-colors hover:text-ink hover:bg-surface-sunken"
          title="Preview clinical PDF"
        >
          Clinical PDF
        </a>
        <a
          href={`/api/patients/${patientId}/protocol/${currentId}/export?audience=client`}
          target="_blank"
          rel="noopener"
          className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-2 text-xs text-ink-subtle transition-colors hover:text-ink hover:bg-surface-sunken"
          title="Preview client PDF"
        >
          Client PDF
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic editable atoms
// ---------------------------------------------------------------------------

function FieldText({
  label,
  value,
  onChange,
  rows = 1,
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
      {rows > 1 ? (
        <textarea
          className={inputClass}
          value={value ?? ""}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function StringList({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const list = items ?? [];
  return (
    <div className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <div className="flex flex-col gap-1">
        {list.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              className={inputClass}
              value={v}
              placeholder={placeholder}
              onChange={(e) =>
                onChange(list.map((x, idx) => (idx === i ? e.target.value : x)))
              }
            />
            <button
              type="button"
              className="text-xs text-danger transition-colors hover:text-danger/80"
              onClick={() => onChange(list.filter((_, idx) => idx !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="self-start rounded-md border border-dashed border-line-strong px-2.5 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-sunken"
          onClick={() => onChange([...list, ""])}
        >
          + Add
        </button>
      </div>
    </div>
  );
}

function ItemList<T extends Record<string, any>>({
  label,
  items,
  empty,
  onChange,
  renderItem,
  addLabel,
}: {
  label: string;
  items: T[];
  empty: () => T;
  onChange: (next: T[]) => void;
  renderItem: (item: T, patch: (p: Partial<T>) => void) => React.ReactNode;
  addLabel?: string;
}) {
  const list = items ?? [];
  return (
    <div className="flex flex-col gap-2">
      <span className={labelClass}>{label}</span>
      {list.map((it, i) => (
        <div
          key={i}
          className="rounded-lg border border-line bg-surface p-3"
        >
          {renderItem(it, (patch) =>
            onChange(list.map((x, idx) => (idx === i ? { ...x, ...patch } : x))),
          )}
          <button
            type="button"
            className="mt-1 text-xs text-danger transition-colors hover:text-danger/80"
            onClick={() => onChange(list.filter((_, idx) => idx !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="self-start rounded-md border border-dashed border-line-strong px-2.5 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-sunken"
        onClick={() => onChange([...list, empty()])}
      >
        + {addLabel ?? "Add"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clinical editor
// ---------------------------------------------------------------------------

const CLINICAL_SECTIONS = [
  { key: "summary_of_findings", label: "Summary", help: "High-level synthesis of key findings across all patient data. Check that it captures the full clinical picture." },
  { key: "systems_analysis", label: "Systems", help: "Body systems involved and how they interconnect. Verify root-cause reasoning and system relationships." },
  { key: "daily_protocol", label: "Daily routine", help: "Structured daily protocol organized by timing (morning, with meals, evening). Review for practicality." },
  { key: "dietary_recommendations", label: "Diet", help: "Specific dietary changes with clinical rationale. Confirm recommendations align with patient's relationship with food." },
  { key: "supplement_protocol", label: "Supplements", help: "Supplements with dosages, timing, and rationale. Verify doses are within safe ranges and check for interactions." },
  { key: "lifestyle_modifications", label: "Lifestyle", help: "Sleep, movement, stress management changes. Ensure these are realistic given the patient's current capacity." },
  { key: "oral_nasal_protocol", label: "Oral / nasal", help: "Oral and nasal microbiome support (tongue scraping, nasal spray, etc.). Often informed by GI Map bacterial patterns." },
  { key: "lab_retesting", label: "Lab retesting", help: "Which labs to re-run and when. Verify timing makes clinical sense for monitoring progress." },
  { key: "follow_up_timeline", label: "Follow-up", help: "Milestones and check-in schedule. Confirm pacing works for this patient's engagement level." },
  { key: "clinical_reasoning", label: "Reasoning", help: "The AI's clinical reasoning chain. Review this carefully — it reveals the logic behind every recommendation." },
  { key: "areas_of_uncertainty", label: "Uncertainty", help: "What the AI is unsure about. These are the areas most likely to need your clinical judgment." },
];

const CLIENT_SECTIONS = [
  { key: "intro", label: "Intro", help: "Personal greeting and context-setting for the patient. Should feel warm, not clinical." },
  { key: "layers", label: "Layers", help: "Symptom-based progression — patient moves forward when symptoms stabilize, not by calendar. Review layer sequencing." },
  { key: "phases", label: "Phases", help: "Calendar-based progression (legacy format). Used by older protocols." },
  { key: "closing_note", label: "Closing", help: "Encouragement and next steps. Should leave the patient feeling supported." },
  { key: "if_something_feels_off", label: "If issues", help: "Safety net — what the patient should do if they experience side effects or concerns." },
];

function SectionNav({ sections, data }: { sections: { key: string; label: string; help?: string }[]; data: Record<string, any> }) {
  return (
    <nav className="mb-3 flex flex-wrap gap-1 border-b border-line pb-3">
      {sections.map((s) => {
        const val = data[s.key];
        const filled = val && (typeof val === "string" ? val.trim() : Array.isArray(val) ? val.length > 0 : true);
        return (
          <button
            key={s.key}
            type="button"
            title={s.help}
            onClick={() => document.getElementById("sec-" + s.key)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              filled ? "bg-accent-soft text-accent" : "bg-surface-sunken text-ink-faint"
            } hover:bg-accent-soft hover:text-accent`}
          >
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}

/** Inline help text shown below each section heading in the editor */
function SectionHelp({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="mb-2 text-xs text-ink-muted italic">{text}</p>
  );
}

/** "Reset to AI original" button — only visible when the section differs from original */
function ResetSectionButton({
  sectionKey,
  current,
  original,
  onReset,
}: {
  sectionKey: string;
  current: unknown;
  original: unknown;
  onReset: () => void;
}) {
  const changed = JSON.stringify(current) !== JSON.stringify(original);
  if (!changed) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm(`Reset "${sectionKey.replace(/_/g, " ")}" to the AI-generated original?`)) {
          onReset();
        }
      }}
      className="self-end rounded-md border border-line-strong bg-surface px-2 py-1 text-[10px] font-medium text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
      title="Reset this section to the original AI-generated content"
    >
      Reset to original
    </button>
  );
}

function TruncationWarning({ generation }: { generation?: Record<string, any> }) {
  if (!generation?.truncated) return null;
  const missing = generation.missing_sections as string[] | undefined;
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3">
      <p className="text-sm font-medium text-warning-emphasis">
        This protocol was too large and the AI output was truncated. Some sections may be incomplete or missing.
      </p>
      {missing && missing.length > 0 ? (
        <p className="mt-1 text-xs text-ink-subtle">
          Potentially affected: {missing.join(", ")}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-ink-subtle">
        Review carefully, or regenerate to get a complete version.
      </p>
    </div>
  );
}

function SafetyReviewCard({ review }: { review: Record<string, any> | undefined }) {
  if (!review || typeof review !== "object") {
    return (
      <div className="rounded-lg border border-line bg-surface-sunken/40 p-4">
        <h3 className="text-sm font-semibold text-ink-subtle">Safety review</h3>
        <p className="mt-1 text-xs text-ink-faint">
          Not available — this protocol was generated before safety guardrails were added.
          Consider regenerating to include safety checks.
        </p>
      </div>
    );
  }

  const checks = [
    { key: "drug_interactions_checked", label: "Drug-supplement interactions checked", icon: "⚖️" },
    { key: "contraindications_noted", label: "Contraindications noted", icon: "⚠️" },
    { key: "dose_ceiling_compliance", label: "Dose ceilings within safe ranges", icon: "📊" },
    { key: "pregnancy_nursing_safe", label: "Pregnancy / nursing screened", icon: "🛡️" },
  ];

  return (
    <div className="rounded-lg border border-accent-soft bg-accent-soft/10 p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">Safety review</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {checks.map(({ key, label, icon }) => {
          const val = review[key];
          const isOk = val === true || val === "yes" || val === "Yes" ||
            (typeof val === "string" && val.toLowerCase().includes("yes"));
          const isFlagged = val === false || val === "no" || val === "No" ||
            (typeof val === "string" && val.toLowerCase().includes("no"));
          return (
            <div key={key} className="flex items-start gap-2 rounded-md border border-line bg-surface p-2.5">
              <span className="text-base leading-none">{icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-ink">{label}</span>
                  {isOk && <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success">OK</span>}
                  {isFlagged && <span className="rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">FLAG</span>}
                </div>
                {typeof val === "string" && val.length > 3 && (
                  <p className="mt-0.5 text-xs text-ink-muted">{val}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function helpFor(sections: { key: string; help?: string }[], key: string): string | undefined {
  return sections.find((s) => s.key === key)?.help;
}

function ClinicalEditor({
  value,
  onChange,
  original,
}: {
  value: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
  original: Record<string, any>;
}) {
  function patch(p: Record<string, any>) {
    onChange({ ...value, ...p });
  }

  return (
    <>
      {/* Safety review — shown prominently before all sections */}
      <SafetyReviewCard review={value.safety_review} />

      <SectionNav sections={CLINICAL_SECTIONS} data={value} />
      <span id="sec-summary_of_findings" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLINICAL_SECTIONS, "summary_of_findings")} />
      <ResetSectionButton sectionKey="summary_of_findings" current={value.summary_of_findings} original={original.summary_of_findings} onReset={() => patch({ summary_of_findings: original.summary_of_findings })} />
      <FieldText
        label="Summary of findings"
        value={value.summary_of_findings ?? ""}
        onChange={(v) => patch({ summary_of_findings: v })}
        rows={4}
      />
      <span id="sec-systems_analysis" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLINICAL_SECTIONS, "systems_analysis")} />
      <ResetSectionButton sectionKey="systems_analysis" current={value.systems_analysis} original={original.systems_analysis} onReset={() => patch({ systems_analysis: original.systems_analysis })} />
      <ItemList
        label="Systems analysis"
        items={value.systems_analysis ?? []}
        empty={() => ({ system: "", finding: "", connects_to: [] as string[] })}
        onChange={(next) => patch({ systems_analysis: next })}
        renderItem={(it, p) => (
          <div className="flex flex-col gap-2">
            <FieldText label="System" value={it.system ?? ""} onChange={(v) => p({ system: v })} />
            <FieldText label="Finding" value={it.finding ?? ""} onChange={(v) => p({ finding: v })} rows={2} />
            <StringList
              label="Connects to"
              items={it.connects_to ?? []}
              onChange={(connects_to) => p({ connects_to })}
            />
          </div>
        )}
      />
      <span id="sec-daily_protocol" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLINICAL_SECTIONS, "daily_protocol")} />
      {value.daily_protocol && typeof value.daily_protocol === "object" ? (
        <div className="flex flex-col gap-3">
          <span className={labelClass}>Daily protocol</span>
          {["morning", "with_meals", "evening", "as_needed"].map((timeslot) => {
            const items = (value.daily_protocol as Record<string, any>)[timeslot];
            if (!items && !Array.isArray(items)) return null;
            return (
              <StringList
                key={timeslot}
                label={timeslot.replace(/_/g, " ").replace(/^\w/, (c: string) => c.toUpperCase())}
                items={Array.isArray(items) ? items : []}
                onChange={(next) =>
                  patch({ daily_protocol: { ...value.daily_protocol, [timeslot]: next } })
                }
              />
            );
          })}
        </div>
      ) : (
        <FieldText
          label="Daily protocol"
          value={typeof value.daily_protocol === "string" ? value.daily_protocol : ""}
          onChange={(v) => patch({ daily_protocol: v })}
          rows={4}
          placeholder="Structured daily routine — morning, with meals, evening"
        />
      )}
      <span id="sec-dietary_recommendations" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLINICAL_SECTIONS, "dietary_recommendations")} />
      <ResetSectionButton sectionKey="dietary_recommendations" current={value.dietary_recommendations} original={original.dietary_recommendations} onReset={() => patch({ dietary_recommendations: original.dietary_recommendations })} />
      <ItemList
        label="Dietary recommendations"
        items={value.dietary_recommendations ?? []}
        empty={() => ({ recommendation: "", rationale: "", priority: "supportive" })}
        onChange={(next) => patch({ dietary_recommendations: next })}
        renderItem={(it, p) => (
          <div className="flex flex-col gap-2">
            <FieldText label="Recommendation" value={it.recommendation ?? ""} onChange={(v) => p({ recommendation: v })} rows={2} />
            <FieldText label="Rationale" value={it.rationale ?? ""} onChange={(v) => p({ rationale: v })} rows={2} />
            <PrioritySelect value={it.priority ?? ""} onChange={(v) => p({ priority: v })} />
          </div>
        )}
      />
      <span id="sec-supplement_protocol" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLINICAL_SECTIONS, "supplement_protocol")} />
      <ResetSectionButton sectionKey="supplement_protocol" current={value.supplement_protocol} original={original.supplement_protocol} onReset={() => patch({ supplement_protocol: original.supplement_protocol })} />
      <ItemList
        label="Supplement protocol"
        items={value.supplement_protocol ?? []}
        empty={() => ({
          name: "", dosage: "", timing: "", duration: "",
          rationale: "", priority: "supportive", cautions: "",
        })}
        onChange={(next) => patch({ supplement_protocol: next })}
        renderItem={(it, p) => (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <FieldText label="Name" value={it.name ?? ""} onChange={(v) => p({ name: v })} />
              <FieldText label="Dosage" value={it.dosage ?? ""} onChange={(v) => p({ dosage: v })} />
              <FieldText label="Timing" value={it.timing ?? ""} onChange={(v) => p({ timing: v })} />
              <FieldText label="Duration" value={it.duration ?? ""} onChange={(v) => p({ duration: v })} />
            </div>
            <FieldText label="Rationale" value={it.rationale ?? ""} onChange={(v) => p({ rationale: v })} rows={2} />
            <FieldText label="Cautions" value={it.cautions ?? ""} onChange={(v) => p({ cautions: v })} rows={2} />
            <PrioritySelect value={it.priority ?? ""} onChange={(v) => p({ priority: v })} />
          </div>
        )}
      />
      <span id="sec-lifestyle_modifications" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLINICAL_SECTIONS, "lifestyle_modifications")} />
      <ResetSectionButton sectionKey="lifestyle_modifications" current={value.lifestyle_modifications} original={original.lifestyle_modifications} onReset={() => patch({ lifestyle_modifications: original.lifestyle_modifications })} />
      <ItemList
        label="Lifestyle modifications"
        items={value.lifestyle_modifications ?? []}
        empty={() => ({ modification: "", rationale: "", priority: "supportive" })}
        onChange={(next) => patch({ lifestyle_modifications: next })}
        renderItem={(it, p) => (
          <div className="flex flex-col gap-2">
            <FieldText label="Modification" value={it.modification ?? ""} onChange={(v) => p({ modification: v })} rows={2} />
            <FieldText label="Rationale" value={it.rationale ?? ""} onChange={(v) => p({ rationale: v })} rows={2} />
            <PrioritySelect value={it.priority ?? ""} onChange={(v) => p({ priority: v })} />
          </div>
        )}
      />
      <span id="sec-oral_nasal_protocol" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLINICAL_SECTIONS, "oral_nasal_protocol")} />
      <ItemList
        label="Oral / nasal protocol"
        items={value.oral_nasal_protocol ?? []}
        empty={() => ({ intervention: "", product: "", dosage: "", timing: "", rationale: "" })}
        onChange={(next) => patch({ oral_nasal_protocol: next })}
        renderItem={(it, p) => (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <FieldText label="Intervention" value={it.intervention ?? ""} onChange={(v) => p({ intervention: v })} placeholder="e.g. tongue scraping, nasal spray" />
              <FieldText label="Product" value={it.product ?? ""} onChange={(v) => p({ product: v })} placeholder="e.g. Xlear, Dentalcidin" />
              <FieldText label="Dosage" value={it.dosage ?? ""} onChange={(v) => p({ dosage: v })} />
              <FieldText label="Timing" value={it.timing ?? ""} onChange={(v) => p({ timing: v })} />
            </div>
            <FieldText label="Rationale" value={it.rationale ?? ""} onChange={(v) => p({ rationale: v })} rows={2} />
          </div>
        )}
      />
      <span id="sec-lab_retesting" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLINICAL_SECTIONS, "lab_retesting")} />
      <ItemList
        label="Lab re-testing"
        items={value.lab_retesting ?? []}
        empty={() => ({ test: "", timing: "", rationale: "" })}
        onChange={(next) => patch({ lab_retesting: next })}
        renderItem={(it, p) => (
          <div className="flex flex-col gap-2">
            <FieldText label="Test" value={it.test ?? ""} onChange={(v) => p({ test: v })} />
            <FieldText label="Timing" value={it.timing ?? ""} onChange={(v) => p({ timing: v })} />
            <FieldText label="Rationale" value={it.rationale ?? ""} onChange={(v) => p({ rationale: v })} rows={2} />
          </div>
        )}
      />
      <span id="sec-follow_up_timeline" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLINICAL_SECTIONS, "follow_up_timeline")} />
      <ItemList
        label="Follow-up timeline"
        items={value.follow_up_timeline ?? []}
        empty={() => ({ milestone: "", focus: "" })}
        onChange={(next) => patch({ follow_up_timeline: next })}
        renderItem={(it, p) => (
          <div className="flex flex-col gap-2">
            <FieldText label="Milestone" value={it.milestone ?? ""} onChange={(v) => p({ milestone: v })} />
            <FieldText label="Focus" value={it.focus ?? ""} onChange={(v) => p({ focus: v })} rows={2} />
          </div>
        )}
      />
      <span id="sec-clinical_reasoning" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLINICAL_SECTIONS, "clinical_reasoning")} />
      <ResetSectionButton sectionKey="clinical_reasoning" current={value.clinical_reasoning} original={original.clinical_reasoning} onReset={() => patch({ clinical_reasoning: original.clinical_reasoning })} />
      <FieldText
        label="Clinical reasoning"
        value={value.clinical_reasoning ?? ""}
        onChange={(v) => patch({ clinical_reasoning: v })}
        rows={6}
      />
      <span id="sec-areas_of_uncertainty" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLINICAL_SECTIONS, "areas_of_uncertainty")} />
      <ItemList
        label="Areas of uncertainty"
        items={value.areas_of_uncertainty ?? []}
        empty={() => ({ issue: "", recommended_evaluation: "", impact_if_wrong: "" })}
        onChange={(next) => patch({ areas_of_uncertainty: next })}
        renderItem={(it, p) => (
          <div className="flex flex-col gap-2">
            <FieldText label="Issue" value={it.issue ?? ""} onChange={(v) => p({ issue: v })} rows={2} />
            <FieldText label="Recommended evaluation" value={it.recommended_evaluation ?? ""} onChange={(v) => p({ recommended_evaluation: v })} rows={2} />
            <FieldText label="Impact if wrong" value={it.impact_if_wrong ?? ""} onChange={(v) => p({ impact_if_wrong: v })} rows={2} />
          </div>
        )}
      />
    </>
  );
}

function PrioritySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>Priority</span>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        <option value="foundational">Foundational</option>
        <option value="supportive">Supportive</option>
        <option value="optional">Optional</option>
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Client editor
// ---------------------------------------------------------------------------

function ClientEditor({
  value,
  onChange,
  original,
}: {
  value: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
  original: Record<string, any>;
}) {
  function patch(p: Record<string, any>) {
    onChange({ ...value, ...p });
  }

  return (
    <>
      <SectionNav sections={CLIENT_SECTIONS} data={value} />
      <span id="sec-intro" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLIENT_SECTIONS, "intro")} />
      <ResetSectionButton sectionKey="intro" current={value.intro} original={original.intro} onReset={() => patch({ intro: original.intro })} />
      <FieldText
        label="Intro"
        value={value.intro ?? ""}
        onChange={(v) => patch({ intro: v })}
        rows={4}
      />
      {/* v2 layers (symptom-based progression with daily routine) */}
      {(value.layers ?? []).length > 0 && (
        <>
          <span id="sec-layers" className="scroll-mt-32" />
          <SectionHelp text={helpFor(CLIENT_SECTIONS, "layers")} />
          <ResetSectionButton sectionKey="layers" current={value.layers} original={original.layers} onReset={() => patch({ layers: original.layers })} />
          <ItemList
            label="Layers"
            items={value.layers ?? []}
            empty={() => ({
              layer: ((value.layers ?? []).length || 0) + 1,
              title: "",
              why_this_comes_first: "",
              daily_routine: { morning: [], with_meals: [], evening: [] },
              what_to_continue: [] as string[],
              desired_outcomes: [] as string[],
              how_youll_know_its_working: [] as string[],
              when_to_move_forward: "",
            })}
            addLabel="Add layer"
            onChange={(next) => patch({ layers: next })}
            renderItem={(it, p) => (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <FieldText label="Layer #" value={String(it.layer ?? "")} onChange={(v) => p({ layer: Number(v) || v })} />
                  <FieldText label="Title" value={it.title ?? ""} onChange={(v) => p({ title: v })} />
                </div>
                <FieldText label="Why this comes first" value={it.why_this_comes_first ?? ""} onChange={(v) => p({ why_this_comes_first: v })} rows={3} />
                <FieldText label="When to move forward" value={it.when_to_move_forward ?? ""} onChange={(v) => p({ when_to_move_forward: v })} rows={3} />
                <StringList label="What to continue" items={it.what_to_continue ?? []} onChange={(what_to_continue) => p({ what_to_continue })} />
                <StringList label="Desired outcomes" items={it.desired_outcomes ?? []} onChange={(desired_outcomes) => p({ desired_outcomes })} />
                <StringList
                  label="How you'll know it's working"
                  items={it.how_youll_know_its_working ?? []}
                  onChange={(how_youll_know_its_working) => p({ how_youll_know_its_working })}
                />
              </div>
            )}
          />
        </>
      )}
      {/* v1 phases fallback (calendar-based, for older protocols) */}
      {(value.phases ?? []).length > 0 && (
        <>
          <span id="sec-phases" className="scroll-mt-32" />
          <SectionHelp text={helpFor(CLIENT_SECTIONS, "phases")} />
          <ItemList
            label="Phases"
            items={value.phases ?? []}
            empty={() => ({
              phase: ((value.phases ?? []).length || 0) + 1,
              weeks: "",
              title: "",
              why_this_comes_first: "",
              what_to_start: [] as { action: string; how_it_helps: string }[],
              what_to_continue: [] as string[],
              desired_outcomes: [] as string[],
              how_youll_know_its_working: [] as string[],
            })}
            addLabel="Add phase"
            onChange={(next) => patch({ phases: next })}
            renderItem={(it, p) => (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-2">
                  <FieldText label="Phase #" value={String(it.phase ?? "")} onChange={(v) => p({ phase: Number(v) || v })} />
                  <FieldText label="Weeks" value={it.weeks ?? ""} onChange={(v) => p({ weeks: v })} />
                  <FieldText label="Title" value={it.title ?? ""} onChange={(v) => p({ title: v })} />
                </div>
                <FieldText label="Why this comes first" value={it.why_this_comes_first ?? ""} onChange={(v) => p({ why_this_comes_first: v })} rows={3} />
                <ItemList
                  label="What to start"
                  items={it.what_to_start ?? []}
                  empty={() => ({ action: "", how_it_helps: "" })}
                  onChange={(what_to_start) => p({ what_to_start })}
                  renderItem={(s, sp) => (
                    <div className="flex flex-col gap-2">
                      <FieldText label="Action" value={s.action ?? ""} onChange={(v) => sp({ action: v })} rows={2} />
                      <FieldText label="How it helps" value={s.how_it_helps ?? ""} onChange={(v) => sp({ how_it_helps: v })} rows={2} />
                    </div>
                  )}
                />
                <StringList label="What to continue" items={it.what_to_continue ?? []} onChange={(what_to_continue) => p({ what_to_continue })} />
                <StringList label="Desired outcomes" items={it.desired_outcomes ?? []} onChange={(desired_outcomes) => p({ desired_outcomes })} />
                <StringList
                  label="How you'll know it's working"
                  items={it.how_youll_know_its_working ?? []}
                  onChange={(how_youll_know_its_working) => p({ how_youll_know_its_working })}
                />
              </div>
            )}
          />
        </>
      )}
      <span id="sec-closing_note" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLIENT_SECTIONS, "closing_note")} />
      <FieldText
        label="Closing note"
        value={value.closing_note ?? ""}
        onChange={(v) => patch({ closing_note: v })}
        rows={3}
      />
      <span id="sec-if_something_feels_off" className="scroll-mt-32" />
      <SectionHelp text={helpFor(CLIENT_SECTIONS, "if_something_feels_off")} />
      <StringList
        label="If something feels off"
        items={value.if_something_feels_off ?? []}
        onChange={(if_something_feels_off) => patch({ if_something_feels_off })}
      />
    </>
  );
}
