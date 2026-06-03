import { z } from "zod";

import type { StepOneTriggerInput } from "../../deterministic-triggers";

import {
  AboutYouSchema,
  createEmptyAboutYou,
  type AboutYou,
} from "./about-you.schema";
import {
  AnythingElseSchema,
  createEmptyAnythingElse,
  type AnythingElse,
} from "./anything-else.schema";
import {
  HistorySchema,
  createEmptyHistory,
  emptyDiagnosis,
  type History,
  type Diagnosis,
} from "./history.schema";
import {
  HormonesSchema,
  createEmptyHormones,
  hormonesTriggerSignal,
  type Hormones,
} from "./hormones.schema";
import { LifestyleSchema, createEmptyLifestyle, type Lifestyle } from "./lifestyle.schema";
import {
  MedicationsSchema,
  MedicationRowSchema,
  createEmptyMedications,
  emptyMedicationRow,
  type Medications,
  type MedicationRow,
} from "./medications.schema";
import {
  SymptomsSchema,
  createEmptyMsqScores,
  createEmptySymptoms,
  msqAutoimmuneTriggered,
  msqDigestiveTriggered,
  type Symptoms,
} from "./msq";
import {
  PreviousLabsSchema,
  createEmptyPreviousLabs,
  type PreviousLabs,
} from "./previous-labs.schema";
import { WearablesSchema, createEmptyWearables, type Wearables } from "./wearables.schema";
import { WhyHereSchema, createEmptyWhyHere, type WhyHere } from "./why-here.schema";

export const StepOneSchema = z.object({
  about_you: AboutYouSchema,
  why_here: WhyHereSchema,
  symptoms: SymptomsSchema,
  history: HistorySchema,
  medications: MedicationsSchema,
  lifestyle: LifestyleSchema,
  hormones: HormonesSchema,
  previous_labs: PreviousLabsSchema,
  wearables: WearablesSchema,
  anything_else: AnythingElseSchema,
});

export type StepOne = z.infer<typeof StepOneSchema>;

export {
  AboutYouSchema,
  AnythingElseSchema,
  HistorySchema,
  HormonesSchema,
  LifestyleSchema,
  MedicationsSchema,
  MedicationRowSchema,
  PreviousLabsSchema,
  SymptomsSchema,
  WearablesSchema,
  WhyHereSchema,
  createEmptyAboutYou,
  createEmptyAnythingElse,
  createEmptyHistory,
  createEmptyHormones,
  createEmptyLifestyle,
  createEmptyMedications,
  createEmptyMsqScores,
  createEmptyPreviousLabs,
  createEmptySymptoms,
  createEmptyWearables,
  createEmptyWhyHere,
  emptyDiagnosis,
  emptyMedicationRow,
  msqAutoimmuneTriggered,
  msqDigestiveTriggered,
  hormonesTriggerSignal,
};

export type {
  AboutYou,
  AnythingElse,
  Diagnosis,
  History,
  Hormones,
  Lifestyle,
  Medications,
  MedicationRow,
  PreviousLabs,
  Symptoms,
  Wearables,
  WhyHere,
};

function medicationNames(medications: StepOne["medications"]): string[] {
  return [...medications.prescriptions, ...medications.supplements]
    .map((row) => row.name.trim())
    .filter(Boolean);
}

/** Maps validated Step-1 data to the deterministic trigger input contract. */
export function toStepOneTriggerInput(stepOne: StepOne): StepOneTriggerInput {
  const wp = stepOne.lifestyle.wellness_practices;
  const names = medicationNames(stepOne.medications);

  return {
    digestive_symptoms: msqDigestiveTriggered(stepOne.symptoms.msq_scores),
    hormonal_symptoms: hormonesTriggerSignal(stepOne.hormones),
    autoimmune: msqAutoimmuneTriggered(stepOne.symptoms.msq_scores),
    medications: names.length === 0 ? null : names,
    sauna: wp.sauna === true,
    cold_exposure: wp.cold_exposure === true,
    meditation: wp.meditation_breathwork === true,
    prior_labs: stepOne.previous_labs.has_previous_labs === true,
  };
}

export function createEmptyStepOne(): StepOne {
  return {
    about_you: createEmptyAboutYou(),
    why_here: createEmptyWhyHere(),
    symptoms: createEmptySymptoms(),
    history: createEmptyHistory(),
    medications: createEmptyMedications(),
    lifestyle: createEmptyLifestyle(),
    hormones: createEmptyHormones(),
    previous_labs: createEmptyPreviousLabs(),
    wearables: createEmptyWearables(),
    anything_else: createEmptyAnythingElse(),
  };
}
