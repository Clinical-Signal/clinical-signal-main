"use client";

import { useState } from "react";

import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";
import { normalizeAboutYouFromIntake } from "./about-you";
import { normalizeHistoryFromIntake } from "./health-history";
import { normalizeMedicationsFromIntake } from "./medications";
import { normalizeAnythingElseFromIntake } from "./anything-else";
import { normalizeHormonesFromIntake } from "./hormones";
import { normalizeLifestyleFromIntake } from "./lifestyle";
import { normalizePreviousLabsFromIntake } from "./previous-labs";
import { normalizeSymptomsFromIntake } from "./symptoms";
import { normalizeWhyHereFromIntake } from "./why-here";
import { normalizeWearablesFromIntake } from "./wearables";

export function useStepOneDraft(initialIntakeData: IntakeData) {
  const [aboutYou, setAboutYou] = useState(() =>
    normalizeAboutYouFromIntake(initialIntakeData.about_you),
  );
  const [whyHere, setWhyHere] = useState(() =>
    normalizeWhyHereFromIntake(initialIntakeData.why_here),
  );
  const [symptoms, setSymptoms] = useState(() =>
    normalizeSymptomsFromIntake(initialIntakeData.symptoms),
  );
  const [history, setHistory] = useState(() =>
    normalizeHistoryFromIntake(initialIntakeData.history),
  );
  const [medications, setMedications] = useState(() =>
    normalizeMedicationsFromIntake(initialIntakeData.medications),
  );
  const [lifestyle, setLifestyle] = useState(() =>
    normalizeLifestyleFromIntake(initialIntakeData.lifestyle),
  );
  const [hormones, setHormones] = useState(() =>
    normalizeHormonesFromIntake(initialIntakeData.hormones),
  );
  const [previousLabs, setPreviousLabs] = useState(() =>
    normalizePreviousLabsFromIntake(initialIntakeData.previous_labs),
  );
  const [wearables, setWearables] = useState(() =>
    normalizeWearablesFromIntake(initialIntakeData.wearables),
  );
  const [anythingElse, setAnythingElse] = useState(() =>
    normalizeAnythingElseFromIntake(initialIntakeData.anything_else),
  );

  return {
    aboutYou,
    setAboutYou,
    whyHere,
    setWhyHere,
    symptoms,
    setSymptoms,
    history,
    setHistory,
    medications,
    setMedications,
    lifestyle,
    setLifestyle,
    hormones,
    setHormones,
    previousLabs,
    setPreviousLabs,
    wearables,
    setWearables,
    anythingElse,
    setAnythingElse,
  };
}
