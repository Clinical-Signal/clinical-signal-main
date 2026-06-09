"use client";

import { useEffect, useState } from "react";
import type { IntakeAboutYouSection } from "@/lib/intake-schema";
import { useDebouncedSave, SectionShell, inputClass, labelClass } from "../shared";

interface Props {
  patientId: string;
  initial: IntakeAboutYouSection | undefined;
  onDraftChange?: (v: IntakeAboutYouSection) => void;
}

const US_STATES = [
  "", "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

const EMPTY: IntakeAboutYouSection = {
  full_name: "",
  date_of_birth: "",
  sex_at_birth: "",
  gender_identity: "",
  height_inches: null,
  weight_lbs: null,
  state: "",
  emergency_contact_name: "",
  emergency_contact_relationship: "",
  emergency_contact_phone: "",
};

export function AboutYouSection({
  patientId,
  initial,
  onDraftChange,
}: Props) {
  const [data, setData] = useState<IntakeAboutYouSection>(
    initial?.full_name !== undefined ? initial : EMPTY,
  );
  const status = useDebouncedSave(patientId, "about_you", data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  function patch(p: Partial<IntakeAboutYouSection>) {
    setData((d) => ({ ...d, ...p }));
  }

  return (
    <SectionShell
      title="About you"
      description="Basic demographics and contact info."
      status={status}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Full name</span>
          <input className={inputClass} value={data.full_name} onChange={(e) => patch({ full_name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Date of birth</span>
          <input className={inputClass} type="date" value={data.date_of_birth} onChange={(e) => patch({ date_of_birth: e.target.value })} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Sex assigned at birth</span>
          <select className={inputClass} value={data.sex_at_birth} onChange={(e) => patch({ sex_at_birth: e.target.value as IntakeAboutYouSection["sex_at_birth"] })}>
            <option value="">—</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="intersex">Intersex</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Gender identity (if different from above)</span>
          <input className={inputClass} value={data.gender_identity} onChange={(e) => patch({ gender_identity: e.target.value })} placeholder="Optional" />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Height (inches)</span>
          <input className={inputClass} type="number" value={data.height_inches ?? ""} min={0} onChange={(e) => patch({ height_inches: e.target.value ? Number(e.target.value) : null })} placeholder="e.g. 65 (5 ft 5 in)" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Weight (lbs)</span>
          <input className={inputClass} type="number" value={data.weight_lbs ?? ""} min={0} onChange={(e) => patch({ weight_lbs: e.target.value ? Number(e.target.value) : null })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>State</span>
          <select className={inputClass} value={data.state} onChange={(e) => patch({ state: e.target.value })}>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s || "—"}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-ink">Emergency contact</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Name</span>
            <input className={inputClass} value={data.emergency_contact_name} onChange={(e) => patch({ emergency_contact_name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Relationship</span>
            <input className={inputClass} value={data.emergency_contact_relationship} onChange={(e) => patch({ emergency_contact_relationship: e.target.value })} placeholder="e.g. spouse, parent" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Phone</span>
            <input className={inputClass} type="tel" value={data.emergency_contact_phone} onChange={(e) => patch({ emergency_contact_phone: e.target.value })} />
          </label>
        </div>
      </div>
    </SectionShell>
  );
}
