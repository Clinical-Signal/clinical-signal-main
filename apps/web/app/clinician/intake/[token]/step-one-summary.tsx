import { Badge } from "@/components/ui/badge";
import { msqGrandTotal, msqSeverityLabel } from "@/lib/intake-schema";
import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";

function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="border-b border-line px-5 py-3 sm:px-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
          {title}
        </h2>
      </header>
      <div className="flex flex-col gap-4 px-5 py-5 text-sm sm:px-6">{children}</div>
    </section>
  );
}

function ReviewField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-ink">
        {value ?? <span className="text-ink-faint">—</span>}
      </dd>
    </div>
  );
}

type StepOneSummaryProps = {
  intakeData: IntakeData;
};

export function StepOneSummary({ intakeData }: StepOneSummaryProps) {
  const { about_you, why_here, symptoms, lifestyle, medications } = intakeData;
  const msqTotal = msqGrandTotal(symptoms.msq_scores);
  const msqLabel = msqSeverityLabel(msqTotal);
  const wp = lifestyle.wellness_practices;
  const wellnessSignals = [
    wp.sauna === true ? "Sauna" : null,
    wp.cold_exposure === true ? "Cold exposure" : null,
    wp.meditation_breathwork === true ? "Meditation / breathwork" : null,
    wp.journaling === true ? "Journaling" : null,
  ].filter(Boolean) as string[];

  const medNames = [
    ...medications.prescriptions,
    ...medications.supplements,
  ]
    .map((row) => row.name.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-5">
      <ReviewSection title="About the patient">
        <div className="grid gap-4 sm:grid-cols-2">
          <ReviewField label="Full name" value={about_you.full_name} />
          <ReviewField label="Date of birth" value={about_you.date_of_birth} />
          <ReviewField label="Sex at birth" value={about_you.sex_at_birth || null} />
          <ReviewField label="State" value={about_you.state || null} />
        </div>
      </ReviewSection>

      <ReviewSection title="Why they are here">
        <ReviewField label="What brings them in" value={why_here.what_brings_you} />
        <ReviewField label="Top goals (3–6 months)" value={why_here.top_three_goals} />
        <ReviewField
          label="Overall health rating"
          value={
            why_here.overall_health_rating !== null
              ? `${why_here.overall_health_rating}/10`
              : null
          }
        />
      </ReviewSection>

      <ReviewSection title="Symptoms (MSQ)">
        <p className="text-ink">
          Total score: <strong>{msqTotal}</strong>{" "}
          <Badge tone="warning">{msqLabel}</Badge>
        </p>
        {symptoms.top_concerns.trim() ? (
          <ReviewField label="Top 3 health concerns" value={symptoms.top_concerns} />
        ) : null}
      </ReviewSection>

      <ReviewSection title="Lifestyle snapshot">
        <ReviewField
          label="Medications & supplements"
          value={
            medNames.length === 0 ? (
              <span className="text-ink-faint">None listed</span>
            ) : (
              <ul className="list-inside list-disc space-y-1">
                {medNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )
          }
        />
        {wellnessSignals.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {wellnessSignals.map((signal) => (
              <li key={signal}>
                <Badge tone="accent">{signal}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </ReviewSection>
    </div>
  );
}
