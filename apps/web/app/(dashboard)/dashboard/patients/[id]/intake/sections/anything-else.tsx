"use client";

import { useEffect, useState } from "react";
import type { IntakeAnythingElseSection } from "@/lib/intake-schema";
import { useDebouncedSave, SectionShell, inputClass, labelClass } from "../shared";

interface Props {
  patientId: string;
  initial: IntakeAnythingElseSection | undefined;
  onDraftChange?: (v: IntakeAnythingElseSection) => void;
}


const REFERRAL_OPTIONS = [
  "Google search",
  "Instagram",
  "Facebook",
  "Podcast",
  "Friend or family",
  "Another practitioner",
  "Other",
];

const EMPTY: IntakeAnythingElseSection = {
  additional_info: "",
  referral_source: "",
};

export function AnythingElseSection({
  patientId,
  initial,
  onDraftChange,
}: Props) {
  const [data, setData] = useState<IntakeAnythingElseSection>(
    initial?.referral_source !== undefined ? initial : EMPTY,
  );
  const status = useDebouncedSave(patientId, "anything_else", data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  return (
    <SectionShell
      title="Anything else?"
      description="Last chance to share anything we haven't covered."
      status={status}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClass}>
          Is there anything else you want your practitioner to know?
        </span>
        <textarea
          className={inputClass}
          value={data.additional_info}
          rows={4}
          placeholder="Anything at all — concerns, questions, context that didn't fit elsewhere..."
          onChange={(e) => setData((d) => ({ ...d, additional_info: e.target.value }))}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>How did you hear about us?</span>
        <select
          className={inputClass}
          value={data.referral_source}
          onChange={(e) => setData((d) => ({ ...d, referral_source: e.target.value }))}
        >
          <option value="">—</option>
          {REFERRAL_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </label>
    </SectionShell>
  );
}
