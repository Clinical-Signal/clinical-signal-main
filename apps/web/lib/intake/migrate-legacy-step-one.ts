import { createEmptyMsqScores } from "./schemas/step-one/msq";
import { createEmptyStepOne, type StepOne } from "./schemas/step-one";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Maps pre-legacy Step-1 JSON (preferred_name booleans) into the expanded
 * legacy-aligned shape before Zod validation.
 */
export function migrateLegacyStepOne(raw: unknown): StepOne {
  const base = createEmptyStepOne();
  if (!isPlainObject(raw)) {
    return base;
  }

  const about = isPlainObject(raw.about_you) ? raw.about_you : {};
  if ("preferred_name" in about && typeof about.preferred_name === "string") {
    base.about_you.full_name = about.preferred_name;
    base.about_you.date_of_birth =
      typeof about.date_of_birth === "string" ? about.date_of_birth : base.about_you.date_of_birth;
    if (about.sex_at_birth === "female" || about.sex_at_birth === "male" || about.sex_at_birth === "intersex") {
      base.about_you.sex_at_birth = about.sex_at_birth;
    }
  } else if (typeof about.full_name === "string") {
    base.about_you = { ...base.about_you, ...(about as typeof base.about_you) };
  }

  const why = isPlainObject(raw.why_here) ? raw.why_here : {};
  if (typeof why.primary_concern === "string") {
    base.why_here.what_brings_you = why.primary_concern;
    if (typeof why.care_goals === "string") {
      base.why_here.top_three_goals = why.care_goals;
    }
  } else if (typeof why.what_brings_you === "string") {
    base.why_here = { ...base.why_here, ...(why as typeof base.why_here) };
  }

  const symptoms = isPlainObject(raw.symptoms) ? raw.symptoms : {};
  if ("digestive_symptoms" in symptoms) {
    const scores = createEmptyMsqScores();
    if (symptoms.digestive_symptoms === true) {
      scores.digestive["Bloated feeling"] = 2;
    }
    if (symptoms.hormonal_symptoms === true) {
      scores.emotions["Mood swings"] = 2;
    }
    if (symptoms.autoimmune === true) {
      scores.other["Frequent illness"] = 2;
    }
    base.symptoms.msq_scores = scores;
    if (typeof symptoms.notes === "string") {
      base.symptoms.top_concerns = symptoms.notes;
    }
  } else {
    base.symptoms = { ...base.symptoms, ...(symptoms as typeof base.symptoms) };
  }

  const lifestyle = isPlainObject(raw.lifestyle) ? raw.lifestyle : {};
  if (Array.isArray(lifestyle.medications)) {
    base.medications.supplements = lifestyle.medications
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((name) => ({
        name,
        dosage: "",
        frequency: "",
        duration: "",
        prescriber: "",
      }));
    base.lifestyle.wellness_practices.sauna = lifestyle.sauna === true;
    base.lifestyle.wellness_practices.cold_exposure = lifestyle.cold_exposure === true;
    base.lifestyle.wellness_practices.meditation_breathwork = lifestyle.meditation === true;
    base.previous_labs.has_previous_labs = lifestyle.prior_labs === true ? true : null;
  } else if (isPlainObject(lifestyle.sleep)) {
    base.lifestyle = { ...base.lifestyle, ...(lifestyle as typeof base.lifestyle) };
  }

  if (isPlainObject(raw.history)) {
    base.history = { ...base.history, ...raw.history } as typeof base.history;
  }
  if (isPlainObject(raw.medications)) {
    base.medications = { ...base.medications, ...raw.medications } as typeof base.medications;
  }
  if (isPlainObject(raw.hormones)) {
    base.hormones = { ...base.hormones, ...raw.hormones } as typeof base.hormones;
  }
  if (isPlainObject(raw.previous_labs)) {
    base.previous_labs = { ...base.previous_labs, ...raw.previous_labs } as typeof base.previous_labs;
  }
  if (isPlainObject(raw.wearables)) {
    base.wearables = { ...base.wearables, ...raw.wearables } as typeof base.wearables;
  }
  if (isPlainObject(raw.anything_else)) {
    base.anything_else = { ...base.anything_else, ...raw.anything_else } as typeof base.anything_else;
  }

  return base;
}
