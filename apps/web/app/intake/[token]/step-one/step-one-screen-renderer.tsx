"use client";

import type { StepOneDraftSlice } from "./step-one-validators";
import type { StepOneScreenKey } from "./step-one-screens";

import { AboutYouScreen } from "./about-you";
import { AnythingElseScreen } from "./anything-else";
import { HealthHistoryScreen } from "./health-history";
import { HormonesScreen } from "./hormones";
import { LifestyleScreen } from "./lifestyle";
import { MedicationsScreen } from "./medications";
import { PreviousLabsScreen } from "./previous-labs";
import { SymptomsScreen } from "./symptoms";
import { WhyHereScreen } from "./why-here";
import { WearablesScreen } from "./wearables";

type StepOneScreenRendererProps = {
  token: string;
  screen: StepOneScreenKey;
  draft: StepOneDraftSlice & {
    setAboutYou: (v: StepOneDraftSlice["aboutYou"]) => void;
    setWhyHere: (v: StepOneDraftSlice["whyHere"]) => void;
    setSymptoms: (v: StepOneDraftSlice["symptoms"]) => void;
    setHistory: (v: StepOneDraftSlice["history"]) => void;
    setMedications: (v: StepOneDraftSlice["medications"]) => void;
    setLifestyle: (v: StepOneDraftSlice["lifestyle"]) => void;
    setHormones: (v: StepOneDraftSlice["hormones"]) => void;
    setPreviousLabs: (v: StepOneDraftSlice["previousLabs"]) => void;
    setWearables: (v: StepOneDraftSlice["wearables"]) => void;
    setAnythingElse: (v: StepOneDraftSlice["anythingElse"]) => void;
  };
  showIntro: boolean;
};

export function StepOneScreenRenderer({
  token,
  screen,
  draft,
  showIntro,
}: StepOneScreenRendererProps) {
  switch (screen) {
    case "about_you":
      return (
        <AboutYouScreen
          token={token}
          value={draft.aboutYou}
          onChange={draft.setAboutYou}
          onIntakeDataSynced={draft.setAboutYou}
          showIntro={showIntro}
        />
      );
    case "why_here":
      return (
        <WhyHereScreen
          token={token}
          value={draft.whyHere}
          onChange={draft.setWhyHere}
          onIntakeDataSynced={draft.setWhyHere}
        />
      );
    case "symptoms":
      return (
        <SymptomsScreen
          token={token}
          value={draft.symptoms}
          onChange={draft.setSymptoms}
          onIntakeDataSynced={draft.setSymptoms}
        />
      );
    case "history":
      return (
        <HealthHistoryScreen
          token={token}
          value={draft.history}
          onChange={draft.setHistory}
          onIntakeDataSynced={draft.setHistory}
        />
      );
    case "medications":
      return (
        <MedicationsScreen
          token={token}
          value={draft.medications}
          onChange={draft.setMedications}
          onIntakeDataSynced={draft.setMedications}
        />
      );
    case "lifestyle":
      return (
        <LifestyleScreen
          token={token}
          value={draft.lifestyle}
          onChange={draft.setLifestyle}
          onIntakeDataSynced={draft.setLifestyle}
        />
      );
    case "hormones":
      return (
        <HormonesScreen
          token={token}
          value={draft.hormones}
          onChange={draft.setHormones}
          onIntakeDataSynced={draft.setHormones}
        />
      );
    case "previous_labs":
      return (
        <PreviousLabsScreen
          token={token}
          value={draft.previousLabs}
          onChange={draft.setPreviousLabs}
          onIntakeDataSynced={draft.setPreviousLabs}
        />
      );
    case "wearables":
      return (
        <WearablesScreen
          token={token}
          value={draft.wearables}
          onChange={draft.setWearables}
          onIntakeDataSynced={draft.setWearables}
        />
      );
    case "anything_else":
      return (
        <AnythingElseScreen
          token={token}
          value={draft.anythingElse}
          onChange={draft.setAnythingElse}
          onIntakeDataSynced={draft.setAnythingElse}
        />
      );
    default:
      return null;
  }
}
