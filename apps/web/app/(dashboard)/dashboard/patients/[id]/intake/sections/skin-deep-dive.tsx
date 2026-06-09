"use client";

import { useEffect, useState } from "react";
import {
  useDebouncedSave,
  SectionShell,
  SelectField,
  TextArea,
  TextField,
} from "../shared";

export interface SkinDeepDiveData {
  primary_skin_concern: string;
  onset_timing: string;
  location_on_body: string;
  triggers_or_patterns: string;
  tried_treatments: string;
  dermatologist_history: string;
  topical_products: string;
  diet_skin_connection: string;
  stress_skin_connection: string;
  cycle_skin_connection: string;
  family_skin_history: string;
}

const EMPTY: SkinDeepDiveData = {
  primary_skin_concern: "",
  onset_timing: "",
  location_on_body: "",
  triggers_or_patterns: "",
  tried_treatments: "",
  dermatologist_history: "",
  topical_products: "",
  diet_skin_connection: "",
  stress_skin_connection: "",
  cycle_skin_connection: "",
  family_skin_history: "",
};

interface Props {
  patientId: string;
  initial: SkinDeepDiveData | undefined;
  onDraftChange?: (v: SkinDeepDiveData) => void;
}

export function SkinDeepDiveSection({ patientId, initial, onDraftChange }: Props) {
  const [data, setData] = useState<SkinDeepDiveData>(initial ?? EMPTY);
  const status = useDebouncedSave(patientId, "skin_deep_dive" as any, data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  function patch(p: Partial<SkinDeepDiveData>) {
    setData((d) => ({ ...d, ...p }));
  }

  return (
    <SectionShell
      title="Skin deep dive"
      description="Skin is a window into gut health, hormones, immune function, and detox. Understanding your skin patterns helps us identify what's happening internally."
      status={status}
    >
      <TextArea
        label="What is your primary skin concern?"
        value={data.primary_skin_concern}
        onChange={(v) => patch({ primary_skin_concern: v })}
        rows={2}
        placeholder="Acne, eczema, psoriasis, rashes, dry skin, hair loss, etc."
      />

      <TextField
        label="When did it start or get worse?"
        value={data.onset_timing}
        onChange={(v) => patch({ onset_timing: v })}
        placeholder="Age, life event, after a medication change, etc."
      />

      <TextField
        label="Where on your body is it primarily?"
        value={data.location_on_body}
        onChange={(v) => patch({ location_on_body: v })}
        placeholder="Face (chin, forehead, cheeks), scalp, back, arms, etc."
      />

      <TextArea
        label="Do you notice any patterns or triggers?"
        value={data.triggers_or_patterns}
        onChange={(v) => patch({ triggers_or_patterns: v })}
        rows={2}
        placeholder="Seasonal? After certain foods? With stress? Around your period?"
      />

      <TextArea
        label="What treatments have you tried?"
        value={data.tried_treatments}
        onChange={(v) => patch({ tried_treatments: v })}
        rows={2}
        placeholder="Topicals, antibiotics, Accutane, elimination diets, supplements, etc."
      />

      <TextArea
        label="Have you seen a dermatologist? What did they recommend?"
        value={data.dermatologist_history}
        onChange={(v) => patch({ dermatologist_history: v })}
        rows={2}
      />

      <TextArea
        label="What topical products do you currently use?"
        value={data.topical_products}
        onChange={(v) => patch({ topical_products: v })}
        rows={2}
        placeholder="Cleanser, moisturizer, sunscreen, prescription creams, etc."
      />

      <TextArea
        label="Have you noticed a connection between your diet and your skin?"
        value={data.diet_skin_connection}
        onChange={(v) => patch({ diet_skin_connection: v })}
        rows={2}
        placeholder="Dairy, gluten, sugar, alcohol — any foods that make it better or worse?"
      />

      <SelectField
        label="Does your skin change with stress?"
        value={data.stress_skin_connection}
        onChange={(v) => patch({ stress_skin_connection: v })}
        options={[
          { value: "", label: "—" },
          { value: "yes_worse", label: "Yes, gets worse with stress" },
          { value: "yes_better", label: "Yes, improves when relaxed" },
          { value: "no", label: "No connection noticed" },
        ]}
      />

      <SelectField
        label="Does your skin change with your menstrual cycle?"
        value={data.cycle_skin_connection}
        onChange={(v) => patch({ cycle_skin_connection: v })}
        options={[
          { value: "", label: "—" },
          { value: "yes_before_period", label: "Worse before period" },
          { value: "yes_during", label: "Worse during period" },
          { value: "yes_ovulation", label: "Worse around ovulation" },
          { value: "no", label: "No pattern" },
          { value: "na", label: "N/A" },
        ]}
      />

      <TextArea
        label="Family history of skin conditions?"
        value={data.family_skin_history}
        onChange={(v) => patch({ family_skin_history: v })}
        rows={2}
      />
    </SectionShell>
  );
}
