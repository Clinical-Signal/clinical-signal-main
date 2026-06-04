import { describe, expect, it } from "vitest";

import { mergeIntakeData } from "./merge-intake";
import { createEmptyMsqScores } from "./schemas/step-one/msq";
import { createEmptyIntakeData, type IntakeData } from "./schemas/intake-data.schema";

function baseIntake(overrides: Partial<IntakeData> = {}): IntakeData {
  const scores = createEmptyMsqScores();
  scores.digestive["Bloated feeling"] = 0;

  return {
    ...createEmptyIntakeData(),
    about_you: {
      ...createEmptyIntakeData().about_you,
      full_name: "Jane Doe",
      date_of_birth: "1985-06-15",
    },
    why_here: {
      ...createEmptyIntakeData().why_here,
      what_brings_you: "Persistent fatigue and bloating",
    },
    symptoms: {
      symptoms: [],
      top_concerns: "",
      msq_scores: scores,
    },
    medications: {
      ...createEmptyIntakeData().medications,
      prescriptions: [
        {
          name: "metformin",
          dosage: "",
          frequency: "",
          duration: "",
          prescriber: "",
        },
      ],
    },
    _provenance: {
      "about_you.full_name": "patient",
      "symptoms.msq_scores": "patient",
      "medications.prescriptions": "patient",
    },
    _ai_confirmations: {},
    _analysis_degraded: false,
    ...overrides,
  };
}

describe("mergeIntakeData", () => {
  it("merges patient fields and records provenance", () => {
    const existing = baseIntake();
    const scores = createEmptyMsqScores();
    scores.digestive["Bloated feeling"] = 3;

    const result = mergeIntakeData(
      existing,
      {
        symptoms: {
          symptoms: [],
          top_concerns: "",
          msq_scores: scores,
        },
      },
      "patient",
    );

    expect(result.symptoms.msq_scores?.digestive?.["Bloated feeling"]).toBe(3);
    expect(result._provenance["symptoms.msq_scores"]).toBe("patient");
  });

  it("ai-over-patient provenance invariant preserves patient value and slots pending confirmation", () => {
    const existing = baseIntake({
      _provenance: {
        "why_here.what_brings_you": "patient",
      },
    });

    const aiInference = "AI suggested concern";

    const result = mergeIntakeData(
      existing,
      {
        why_here: {
          ...existing.why_here,
          what_brings_you: aiInference,
        },
      },
      "ai",
    );

    expect(result.why_here.what_brings_you).toBe(existing.why_here.what_brings_you);
    expect(result._provenance["why_here.what_brings_you"]).toBe("patient");
    expect(result._ai_confirmations["why_here.what_brings_you"]).toEqual({
      value: aiInference,
      confirmed: false,
    });
  });

  it("merges clinician edits and marks confirmations as confirmed", () => {
    const existing = baseIntake({
      _ai_confirmations: {
        "why_here.what_brings_you": {
          value: "AI draft",
          confirmed: false,
        },
      },
    });

    const result = mergeIntakeData(
      existing,
      {
        why_here: {
          ...existing.why_here,
          what_brings_you: "Clinician edit",
        },
      },
      "clinician",
    );

    expect(result.why_here.what_brings_you).toBe("Clinician edit");
    expect(result._provenance["why_here.what_brings_you"]).toBe("clinician");
    expect(result._ai_confirmations["why_here.what_brings_you"]).toEqual({
      value: "Clinician edit",
      confirmed: true,
    });
  });

  it("merges step_two answers without touching metadata maps directly", () => {
    const existing = baseIntake({
      step_two: {
        bloating: "after meals",
      },
    });

    const result = mergeIntakeData(
      existing,
      {
        step_two: {
          bloating: "after meals",
          reflux: "nightly",
        },
      },
      "patient",
    );

    expect(result.step_two).toEqual({
      bloating: "after meals",
      reflux: "nightly",
    });
    expect(result._provenance["step_two.reflux"]).toBe("patient");
  });

  it("does not mutate the existing intake object", () => {
    const existing = baseIntake();
    const snapshot = structuredClone(existing);

    mergeIntakeData(
      existing,
      {
        lifestyle: {
          ...existing.lifestyle,
          wellness_practices: {
            ...existing.lifestyle.wellness_practices,
            sauna: true,
          },
        },
      },
      "patient",
    );

    expect(existing).toEqual(snapshot);
  });
});
