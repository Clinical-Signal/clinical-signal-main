import {
  AboutYouSchema,
  WhyHereSchema,
  type AboutYou,
  type AnythingElse,
  type History,
  type Hormones,
  type Lifestyle,
  type Medications,
  type PreviousLabs,
  type Symptoms,
  type Wearables,
  type WhyHere,
} from "@/lib/intake/schemas/step-one.schema";

import { isAboutYouValid } from "./about-you-field-errors";
import type { StepOneScreenKey } from "./step-one-screens";

export type StepOneDraftSlice = {
  aboutYou: AboutYou;
  whyHere: WhyHere;
  symptoms: Symptoms;
  history: History;
  medications: Medications;
  lifestyle: Lifestyle;
  hormones: Hormones;
  previousLabs: PreviousLabs;
  wearables: Wearables;
  anythingElse: AnythingElse;
};

export function canAdvanceStepOneScreen(
  screen: StepOneScreenKey,
  draft: StepOneDraftSlice,
): boolean {
  switch (screen) {
    case "about_you":
      return isAboutYouValid(draft.aboutYou);
    case "why_here":
      return WhyHereSchema.safeParse(draft.whyHere).success;
    default:
      return true;
  }
}

export function isStepOneDraftValid(draft: StepOneDraftSlice): boolean {
  return (
    AboutYouSchema.safeParse(draft.aboutYou).success &&
    WhyHereSchema.safeParse(draft.whyHere).success
  );
}
