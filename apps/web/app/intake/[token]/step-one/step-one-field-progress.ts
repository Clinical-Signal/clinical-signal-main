import type { StepOneDraftSlice } from "./step-one-validators";

type FieldCheck = {
  isComplete: (draft: StepOneDraftSlice) => boolean;
};

const REQUIRED_FIELD_CHECKS: FieldCheck[] = [
  { isComplete: (draft) => draft.aboutYou.full_name.trim().length > 0 },
  {
    isComplete: (draft) => /^\d{4}-\d{2}-\d{2}$/.test(draft.aboutYou.date_of_birth),
  },
  { isComplete: (draft) => draft.aboutYou.sex_at_birth !== "" },
  { isComplete: (draft) => draft.whyHere.what_brings_you.trim().length >= 3 },
  { isComplete: (draft) => draft.whyHere.top_three_goals.trim().length > 0 },
  {
    isComplete: (draft) =>
      draft.whyHere.overall_health_rating !== null &&
      draft.whyHere.overall_health_rating >= 1,
  },
  {
    isComplete: (draft) =>
      draft.whyHere.motivation_level !== null && draft.whyHere.motivation_level >= 1,
  },
  { isComplete: (draft) => draft.aboutYou.state.trim().length === 2 },
  { isComplete: (draft) => draft.symptoms.top_concerns.trim().length > 0 },
  {
    isComplete: (draft) =>
      draft.history.diagnoses.some((row) => row.condition.trim().length > 0) ||
      draft.history.surgeries.trim().length > 0 ||
      draft.history.family_history.trim().length > 0,
  },
  {
    isComplete: (draft) =>
      draft.medications.prescriptions.some((row) => row.name.trim().length > 0) ||
      draft.medications.supplements.some((row) => row.name.trim().length > 0),
  },
  {
    isComplete: (draft) =>
      draft.lifestyle.sleep.quality !== "" || draft.lifestyle.nutrition.diet_type !== "",
  },
  { isComplete: (draft) => draft.previousLabs.has_previous_labs !== null },
  { isComplete: (draft) => draft.wearables.willing_to_share !== "" },
  {
    isComplete: (draft) =>
      draft.anythingElse.additional_info.trim().length > 0 ||
      draft.anythingElse.referral_source.trim().length > 0,
  },
];

export function computeStepOneFieldProgress(draft: StepOneDraftSlice): number {
  const completed = REQUIRED_FIELD_CHECKS.filter((check) => check.isComplete(draft)).length;
  const total = REQUIRED_FIELD_CHECKS.length;
  if (total === 0) {
    return 0;
  }
  return Math.round((completed / total) * 100);
}
