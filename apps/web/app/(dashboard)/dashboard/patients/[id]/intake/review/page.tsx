import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import {
  getIntake,
  type IntakeData,
  type IntakeMedication,
  type IntakeSymptom,
} from "@/lib/intake";
import { Page, PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";

export default async function IntakeReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, params.id);
  if (!ok) notFound();
  const data = await getIntake(user.tenantId, params.id);

  return (
    <Page>
      <div className="mb-2">
        <Link
          href={`/dashboard/patients/${params.id}`}
          className="text-sm text-ink-subtle transition-colors hover:text-ink"
        >
          ← Back to patient
        </Link>
      </div>
      <PageHeader
        eyebrow={
          data.submitted_at ? (
            <span className="inline-flex items-center gap-2">
              <Badge tone="success">Submitted</Badge>
              <span>{new Date(data.submitted_at).toLocaleString()}</span>
            </span>
          ) : (
            <Badge tone="warning">Draft</Badge>
          )
        }
        title="Intake review"
        description="Read-only view of the captured baseline. Edit to make changes — a new save will update the record in place."
        actions={
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
            href={`/dashboard/patients/${params.id}/intake`}
          >
            Edit intake
          </Link>
        }
      />

      <div className="flex flex-col gap-5">
        <SymptomsBlock data={data} />
        <HistoryBlock data={data} />
        <MedicationsBlock data={data} />
        <LifestyleBlock data={data} />
        <GoalsBlock data={data} />
        <PreviousLabsBlock data={data} />
      </div>
    </Page>
  );
}

function Block({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-6 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
          {title}
        </h3>
      </header>
      <div className="flex flex-col gap-3 px-6 py-5 text-sm text-ink-muted">
        {empty ? (
          <p className="text-ink-faint">Nothing recorded for this section yet.</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-ink">
        {value || <span className="text-ink-faint">—</span>}
      </dd>
    </div>
  );
}

function severityClass(s: number): string {
  if (s >= 8) return "bg-danger-soft text-danger";
  if (s >= 5) return "bg-warning-soft text-warning";
  return "bg-success-soft text-success";
}

function SymptomsBlock({ data }: { data: IntakeData }) {
  const symptoms: IntakeSymptom[] = [...(data.symptoms?.symptoms ?? [])]
    .filter((s) => s.name.trim())
    .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0));
  const topConcerns = data.symptoms?.top_concerns?.trim();
  const isEmpty = symptoms.length === 0 && !topConcerns;
  return (
    <Block title="Current symptoms" empty={isEmpty}>
      {symptoms.length === 0 ? (
        <p className="text-slate-500">No symptoms recorded.</p>
      ) : (
        <ul className="divide-y divide-line">
          {symptoms.map((s, i) => (
            <li key={i} className="flex flex-col gap-1 py-2">
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${severityClass(s.severity)}`}>
                  {s.severity}/10
                </span>
                <span className="font-medium">{s.name}</span>
                {s.duration_value && s.duration_unit ? (
                  <span className="text-xs text-ink-subtle">
                    {s.duration_value} {s.duration_unit}
                  </span>
                ) : null}
              </div>
              {s.notes ? (
                <p className="ml-1 text-xs text-ink-muted">{s.notes}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Field label="Top 3 health concerns" value={data.symptoms?.top_concerns} />
    </Block>
  );
}

function HistoryBlock({ data }: { data: IntakeData }) {
  const dx = data.history?.diagnoses?.filter((d) => d.condition.trim()) ?? [];
  const isEmpty =
    dx.length === 0 && !data.history?.surgeries?.trim() && !data.history?.family_history?.trim();
  return (
    <Block title="Health history" empty={isEmpty}>
      {dx.length === 0 ? null : (
        <ul className="divide-y divide-line">
          {dx.map((d, i) => (
            <li key={i} className="py-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{d.condition}</span>
                {d.year ? <span className="text-xs text-ink-subtle">{d.year}</span> : null}
                {d.status ? (
                  <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">
                    {d.status}
                  </span>
                ) : null}
              </div>
              {d.treatment ? (
                <p className="text-xs text-ink-muted">Treatment: {d.treatment}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Field label="Surgeries / hospitalizations" value={data.history?.surgeries} />
      <Field label="Family health history" value={data.history?.family_history} />
    </Block>
  );
}

function MedRows({ items }: { items: IntakeMedication[] }) {
  const rows = items.filter((m) => m.name.trim());
  if (rows.length === 0)
    return <p className="text-ink-faint">None recorded.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((m, i) => (
        <li key={i} className="py-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium">{m.name}</span>
            {m.dosage ? <span className="text-xs text-ink-muted">{m.dosage}</span> : null}
            {m.frequency ? (
              <span className="text-xs text-ink-muted">· {m.frequency}</span>
            ) : null}
            {m.duration ? (
              <span className="text-xs text-ink-subtle">· {m.duration}</span>
            ) : null}
            {m.prescriber ? (
              <span className="text-xs text-ink-subtle">· Rx {m.prescriber}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function MedicationsBlock({ data }: { data: IntakeData }) {
  const isEmpty =
    !data.medications?.prescriptions?.some((m) => m.name.trim()) &&
    !data.medications?.supplements?.some((m) => m.name.trim());
  return (
    <Block title="Medications & supplements" empty={isEmpty}>
      <div>
        <h4 className="text-sm font-semibold text-ink">Prescription medications</h4>
        <MedRows items={data.medications?.prescriptions ?? []} />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-ink">Supplements</h4>
        <MedRows items={data.medications?.supplements ?? []} />
      </div>
    </Block>
  );
}

function LifestyleBlock({ data }: { data: IntakeData }) {
  const ls = data.lifestyle;
  if (!ls) {
    return <Block title="Lifestyle" empty />;
  }
  return (
    <Block title="Lifestyle">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold text-ink">Sleep</h4>
          <Field
            label="Average hours / night"
            value={ls.sleep?.average_hours ?? ""}
          />
          <Field label="Quality" value={ls.sleep?.quality ?? ""} />
          <Field label="Issues" value={ls.sleep?.issues ?? ""} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-ink">Nutrition</h4>
          <Field label="Diet type" value={ls.nutrition?.diet_type ?? ""} />
          <Field label="Daily water (oz)" value={ls.nutrition?.water_oz_per_day ?? ""} />
          <Field label="Restrictions" value={ls.nutrition?.restrictions ?? ""} />
          <Field label="Sensitivities" value={ls.nutrition?.sensitivities ?? ""} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-ink">Exercise</h4>
          <Field label="Type" value={ls.exercise?.type ?? ""} />
          <Field label="Sessions / week" value={ls.exercise?.frequency_per_week ?? ""} />
          <Field label="Intensity" value={ls.exercise?.intensity ?? ""} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-ink">Stress</h4>
          <Field label="Level (1–10)" value={ls.stress?.level ?? ""} />
          <Field label="Sources" value={ls.stress?.sources ?? ""} />
          <Field label="Management" value={ls.stress?.management ?? ""} />
        </div>
      </div>
    </Block>
  );
}

function GoalsBlock({ data }: { data: IntakeData }) {
  const isEmpty =
    !data.goals?.desired_outcomes?.trim() &&
    !data.goals?.failed_approaches?.trim() &&
    !data.goals?.commitment;
  return (
    <Block title="Health goals" empty={isEmpty}>
      <Field label="Hoping to achieve" value={data.goals?.desired_outcomes} />
      <Field label="Tried that hasn't worked" value={data.goals?.failed_approaches} />
      <Field label="Commitment (1–10)" value={data.goals?.commitment ?? ""} />
    </Block>
  );
}

function PreviousLabsBlock({ data }: { data: IntakeData }) {
  const hasAnswer =
    data.previous_labs?.has_previous_labs !== null &&
    data.previous_labs?.has_previous_labs !== undefined;
  const isEmpty = !hasAnswer && !data.previous_labs?.remembered_results?.trim();
  return (
    <Block title="Previous labs" empty={isEmpty}>
      <Field
        label="Has previous labs?"
        value={
          data.previous_labs?.has_previous_labs === undefined ||
          data.previous_labs?.has_previous_labs === null
            ? ""
            : data.previous_labs.has_previous_labs
              ? "Yes"
              : "No"
        }
      />
      <Field
        label="Remembered results"
        value={data.previous_labs?.remembered_results}
      />
    </Block>
  );
}
