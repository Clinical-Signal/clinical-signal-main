"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  changeProtocolStatus,
  regenerateProtocol,
  saveProtocolEdits,
} from "./actions";

type Status = "draft" | "review" | "finalized";

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
  "w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none";
const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-slate-500";

export function EditForm(props: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(props.initialTitle);
  const [status, setStatus] = useState<Status>(props.initialStatus);
  const [clinical, setClinical] = useState(stripGen(props.initialClinical));
  const [client, setClient] = useState(props.initialClient);
  const [saving, startSave] = useTransition();
  const [statusSaving, startStatus] = useTransition();
  const [regenerating, startRegen] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      />
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Output A — Clinical Protocol" tone="white">
          <ClinicalEditor value={clinical} onChange={setClinical} />
        </Panel>
        <Panel title="Output B — Phased Client Action Plan" tone="slate">
          <ClientEditor value={client} onChange={setClient} />
        </Panel>
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
  tone,
  children,
}: {
  title: string;
  tone: "white" | "slate";
  children: React.ReactNode;
}) {
  return (
    <article
      className={`rounded border border-slate-200 p-4 ${
        tone === "white" ? "bg-white" : "bg-slate-50"
      }`}
    >
      <h3 className="mb-3 border-b border-slate-200 pb-2 text-base font-semibold">
        {title}
      </h3>
      <div className="flex flex-col gap-4">{children}</div>
    </article>
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
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-white p-3">
      <label className="flex flex-1 flex-col gap-1 min-w-[260px]">
        <span className={labelClass}>Title</span>
        <input
          className={inputClass}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Status (v{currentVersion})</span>
        <select
          className={inputClass}
          value={status}
          disabled={statusSaving}
          onChange={(e) => onStatusChange(e.target.value as Status)}
        >
          <option value="draft">Draft</option>
          <option value="review">Review</option>
          <option value="finalized">Finalized</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Version</span>
        <select
          className={inputClass}
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
      <button
        type="button"
        className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        disabled={saving}
        onClick={onSave}
      >
        {saving ? "Saving…" : "Save as new version"}
      </button>
      <button
        type="button"
        className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60"
        disabled={regenerating}
        onClick={onRegenerate}
        title="Re-run protocol generation against the linked analysis"
      >
        {regenerating ? "Regenerating…" : "Regenerate"}
      </button>
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
              className="text-xs text-red-600"
              onClick={() => onChange(list.filter((_, idx) => idx !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="self-start rounded border border-dashed border-slate-400 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
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
          className="rounded border border-slate-200 bg-white p-2 shadow-sm"
        >
          {renderItem(it, (patch) =>
            onChange(list.map((x, idx) => (idx === i ? { ...x, ...patch } : x))),
          )}
          <button
            type="button"
            className="mt-1 text-xs text-red-600"
            onClick={() => onChange(list.filter((_, idx) => idx !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="self-start rounded border border-dashed border-slate-400 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
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

function ClinicalEditor({
  value,
  onChange,
}: {
  value: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
}) {
  function patch(p: Record<string, any>) {
    onChange({ ...value, ...p });
  }

  return (
    <>
      <FieldText
        label="Summary of findings"
        value={value.summary_of_findings ?? ""}
        onChange={(v) => patch({ summary_of_findings: v })}
        rows={4}
      />
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
      <FieldText
        label="Clinical reasoning"
        value={value.clinical_reasoning ?? ""}
        onChange={(v) => patch({ clinical_reasoning: v })}
        rows={6}
      />
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
}: {
  value: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
}) {
  function patch(p: Record<string, any>) {
    onChange({ ...value, ...p });
  }

  return (
    <>
      <FieldText
        label="Intro"
        value={value.intro ?? ""}
        onChange={(v) => patch({ intro: v })}
        rows={4}
      />
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
      <FieldText
        label="Closing note"
        value={value.closing_note ?? ""}
        onChange={(v) => patch({ closing_note: v })}
        rows={3}
      />
      <StringList
        label="If something feels off"
        items={value.if_something_feels_off ?? []}
        onChange={(if_something_feels_off) => patch({ if_something_feels_off })}
      />
    </>
  );
}
