import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";

import { ReviewSection } from "@/app/clinician/intake/[token]/review-primitives";

import {
  formatStepOneForDisplay,
  groupStepOneDisplayEntries,
  NOT_PROVIDED,
} from "@/lib/intake/format-step-one-for-display";

type PatientIntakeStepOneSummaryProps = {
  intakeData: IntakeData;
};

export function PatientIntakeStepOneSummary({ intakeData }: PatientIntakeStepOneSummaryProps) {
  const sections = groupStepOneDisplayEntries(formatStepOneForDisplay(intakeData));

  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <ReviewSection key={section.sectionTitle} title={section.sectionTitle}>
          <dl className="flex flex-col gap-4">
            {section.fields.map((field) => (
              <div key={`${section.sectionTitle}-${field.label}`}>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                  {field.label}
                </dt>
                <dd
                  className={`mt-1 whitespace-pre-wrap text-sm ${
                    field.value === NOT_PROVIDED ? "text-ink-faint italic" : "text-ink"
                  }`}
                >
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        </ReviewSection>
      ))}
    </div>
  );
}
