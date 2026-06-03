"use client";

import { useMemo, useState } from "react";

import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";
import type { IntakeStatus } from "@/lib/db/schema/patients-intake";

import { AboutYouScreen, normalizeAboutYouFromIntake } from "./about-you";
import { AnythingElseScreen, normalizeAnythingElseFromIntake } from "./anything-else";
import { HealthHistoryScreen, normalizeHistoryFromIntake } from "./health-history";
import { HormonesScreen, normalizeHormonesFromIntake } from "./hormones";
import { LifestyleScreen, normalizeLifestyleFromIntake } from "./lifestyle";
import { MedicationsScreen, normalizeMedicationsFromIntake } from "./medications";
import { MsqSymptomsScreen, normalizeSymptomsFromIntake } from "./msq-symptoms";
import { PreviousLabsScreen, normalizePreviousLabsFromIntake } from "./previous-labs";
import { WearablesScreen, normalizeWearablesFromIntake } from "./wearables";
import { WhyHereScreen, normalizeWhyHereFromIntake } from "./why-here";

const STEP_ONE_SCREENS = [
  { key: "about_you", label: "About you" },
  { key: "why_here", label: "Why you're here" },
  { key: "symptoms", label: "Current symptoms" },
  { key: "history", label: "Health history" },
  { key: "medications", label: "Medications & supplements" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "hormones", label: "Hormones & cycle" },
  { key: "previous_labs", label: "Previous labs" },
  { key: "wearables", label: "Wearables & tracking" },
  { key: "anything_else", label: "Anything else" },
] as const;

type StepKey = (typeof STEP_ONE_SCREENS)[number]["key"];

export type StepOneFormProps = {
  token: string;
  intakeStatus: IntakeStatus;
  initialIntakeData: IntakeData;
};

export function StepOneForm({ token, intakeStatus, initialIntakeData }: StepOneFormProps) {
  const [currentStep, setCurrentStep] = useState<StepKey>("about_you");
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
  const [stepOneComplete, setStepOneComplete] = useState(false);

  const stepIndex = STEP_ONE_SCREENS.findIndex((step) => step.key === currentStep);
  const isLastStep = stepIndex >= STEP_ONE_SCREENS.length - 1;
  const progressPct = ((stepIndex + 1) / STEP_ONE_SCREENS.length) * 100;

  const stepLabel = useMemo(
    () => STEP_ONE_SCREENS.find((step) => step.key === currentStep)?.label ?? "",
    [currentStep],
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-canvas px-4 py-6">
      <header className="mb-6 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Step 1 · {stepIndex + 1} of {STEP_ONE_SCREENS.length}
        </p>
        <h1 className="font-serif text-xl text-ink">{stepLabel}</h1>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={STEP_ONE_SCREENS.length}
          aria-label="Step 1 progress"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-ink-subtle">Status: {intakeStatus.replaceAll("_", " ")}</p>
      </header>

      <main className="flex-1 pb-8">
        {currentStep === "about_you" ? (
          <AboutYouScreen
            token={token}
            value={aboutYou}
            onChange={setAboutYou}
            onIntakeDataSynced={setAboutYou}
            showIntro
          />
        ) : null}
        {currentStep === "why_here" ? (
          <WhyHereScreen
            token={token}
            value={whyHere}
            onChange={setWhyHere}
            onIntakeDataSynced={setWhyHere}
          />
        ) : null}
        {currentStep === "symptoms" ? (
          <MsqSymptomsScreen
            token={token}
            value={symptoms}
            onChange={setSymptoms}
            onIntakeDataSynced={setSymptoms}
          />
        ) : null}
        {currentStep === "history" ? (
          <HealthHistoryScreen
            token={token}
            value={history}
            onChange={setHistory}
            onIntakeDataSynced={setHistory}
          />
        ) : null}
        {currentStep === "medications" ? (
          <MedicationsScreen
            token={token}
            value={medications}
            onChange={setMedications}
            onIntakeDataSynced={setMedications}
          />
        ) : null}
        {currentStep === "lifestyle" ? (
          <LifestyleScreen
            token={token}
            value={lifestyle}
            onChange={setLifestyle}
            onIntakeDataSynced={setLifestyle}
          />
        ) : null}
        {currentStep === "hormones" ? (
          <HormonesScreen
            token={token}
            value={hormones}
            onChange={setHormones}
            onIntakeDataSynced={setHormones}
          />
        ) : null}
        {currentStep === "previous_labs" ? (
          <PreviousLabsScreen
            token={token}
            value={previousLabs}
            onChange={setPreviousLabs}
            onIntakeDataSynced={setPreviousLabs}
          />
        ) : null}
        {currentStep === "wearables" ? (
          <WearablesScreen
            token={token}
            value={wearables}
            onChange={setWearables}
            onIntakeDataSynced={setWearables}
          />
        ) : null}
        {currentStep === "anything_else" ? (
          <AnythingElseScreen
            token={token}
            value={anythingElse}
            onChange={setAnythingElse}
            onIntakeDataSynced={setAnythingElse}
          />
        ) : null}
      </main>

      {stepOneComplete ? (
        <div
          className="mb-4 rounded-lg border border-line bg-surface p-4 text-sm text-ink-muted"
          role="status"
        >
          Step 1 is saved.{" "}
          <a
            href={`/intake/${encodeURIComponent(token)}/step-two`}
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Continue to Step 2 follow-up questions
          </a>
          .
        </div>
      ) : null}

      <footer className="sticky bottom-0 border-t border-line bg-canvas pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex gap-3">
          <button
            type="button"
            className="min-h-12 flex-1 rounded-md border border-line-strong bg-surface px-4 text-base font-medium text-ink disabled:opacity-40"
            disabled={stepIndex === 0}
            onClick={() => {
              const previous = STEP_ONE_SCREENS[stepIndex - 1];
              if (previous) {
                setCurrentStep(previous.key);
              }
            }}
          >
            Back
          </button>
          <button
            type="button"
            className="min-h-12 flex-1 rounded-md bg-accent px-4 text-base font-medium text-ink-inverse disabled:opacity-40"
            disabled={stepOneComplete && isLastStep}
            onClick={() => {
              if (isLastStep) {
                setStepOneComplete(true);
                return;
              }
              const next = STEP_ONE_SCREENS[stepIndex + 1];
              if (next) {
                setCurrentStep(next.key);
              }
            }}
          >
            {isLastStep ? "Complete step 1" : "Next"}
          </button>
        </div>
      </footer>
    </div>
  );
}
