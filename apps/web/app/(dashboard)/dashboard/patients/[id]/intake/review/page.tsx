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
    <section className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Intake review</h2>
          <p className="text-sm text-slate-600">
            {data.submitted_at
              ? `Submitted ${new Date(data.submitted_at).toLocaleString()}`
              : "Draft — not yet submitted"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
            href={`/dashboard/patients/${params.id}/intake`}
          >
            Edit intake
          </Link>
          <Link
            className="text-sm underline"
            href={`/dashboard/patients/${params.id}`}
          >
            ← Back to patient
          </Link>
        </div>
      </header>

      <SymptomsBlock data={data} />
      <HistoryBlock data={data} />
      <MedicationsBlock data={data} />
      <LifestyleBlock data={data} />
      <GoalsBlock data={data} />
      <PreviousLabsBlock data={data} />
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      <div className="flex flex-col gap-3 text-sm text-slate-700">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap">{value || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

function severityClass(s: number): string {
  if (s >= 8) return "bg-red-100 text-red-900";
  if (s >= 5) return "bg-amber-100 text-amber-900";
  return "bg-emerald-100 text-emerald-900";
}

function SymptomsBlock({ data }: { data: IntakeData }) {
  const symptoms: IntakeSymptom[] = [...(data.symptoms?.symptoms ?? [])]
    .filter((s) => s.name.trim())
    .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0));
  return (
    <Block title="Current symptoms">
      {symptoms.length === 0 ? (
        <p className="text-slate-500">No symptoms recorded.</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {symptoms.map((s, i) => (
            <li key={i} className="flex flex-col gap-1 py-2">
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${severityClass(s.severity)}`}>
                  {s.severity}/10
                </span>
                <span className="font-medium">{s.name}</span>
                {s.duration_value && s.duration_unit ? (
                  <span className="text-xs text-slate-500">
                    {s.duration_value} {s.duration_unit}
                  </span>
                ) : null}
              </div>
              {s.notes ? (
                <p className="ml-1 text-xs text-slate-600">{s.notes}</p>
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
  return (
    <Block title="Health history">
      {dx.length === 0 ? null : (
        <ul className="divide-y divide-slate-200">
          {dx.map((d, i) => (
            <li key={i} className="py-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{d.condition}</span>
                {d.year ? <span className="text-xs text-slate-500">{d.year}</span> : null}
                {d.status ? (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {d.status}
                  </span>
                ) : null}
              </div>
              {d.treatment ? (
                <p className="text-xs text-slate-600">Treatment: {d.treatment}</p>
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
  if (rows.length === 0) return <p className="text-slate-500">None recorded.</p>;
  return (
    <ul className="divide-y divide-slate-200">
      {rows.map((m, i) => (
        <li key={i} className="py-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium">{m.name}</span>
            {m.dosage ? <span className="text-xs text-slate-600">{m.dosage}</span> : null}
            {m.frequency ? (
              <span className="text-xs text-slate-600">· {m.frequency}</span>
            ) : null}
            {m.duration ? (
              <span className="text-xs text-slate-500">· {m.duration}</span>
            ) : null}
            {m.prescriber ? (
              <span className="text-xs text-slate-500">· Rx {m.prescriber}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function MedicationsBlock({ data }: { data: IntakeData }) {
  return (
    <Block title="Medications & supplements">
      <div>
        <h4 className="text-sm font-semibold text-slate-700">Prescription medications</h4>
        <MedRows items={data.medications?.prescriptions ?? []} />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-700">Supplements</h4>
        <MedRows items={data.medications?.supplements ?? []} />
      </div>
    </Block>
  );
}

function LifestyleBlock({ data }: { data: IntakeData }) {
  const ls = data.lifestyle;
  if (!ls) {
    return (
      <Block title="Lifestyle">
        <p className="text-slate-500">Not yet recorded.</p>
      </Block>
    );
  }
  return (
    <Block title="Lifestyle">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-700">Sleep</h4>
          <Field
            label="Average hours / night"
            value={ls.sleep?.average_hours ?? ""}
          />
          <Field label="Quality" value={ls.sleep?.quality ?? ""} />
          <Field label="Issues" value={ls.sleep?.issues ?? ""} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-700">Nutrition</h4>
          <Field label="Diet type" value={ls.nutrition?.diet_type ?? ""} />
          <Field label="Daily water (oz)" value={ls.nutrition?.water_oz_per_day ?? ""} />
          <Field label="Restrictions" value={ls.nutrition?.restrictions ?? ""} />
          <Field label="Sensitivities" value={ls.nutrition?.sensitivities ?? ""} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-700">Exercise</h4>
          <Field label="Type" value={ls.exercise?.type ?? ""} />
          <Field label="Sessions / week" value={ls.exercise?.frequency_per_week ?? ""} />
          <Field label="Intensity" value={ls.exercise?.intensity ?? ""} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-700">Stress</h4>
          <Field label="Level (1–10)" value={ls.stress?.level ?? ""} />
          <Field label="Sources" value={ls.stress?.sources ?? ""} />
          <Field label="Management" value={ls.stress?.management ?? ""} />
        </div>
      </div>
    </Block>
  );
}

function GoalsBlock({ data }: { data: IntakeData }) {
  return (
    <Block title="Health goals">
      <Field label="Hoping to achieve" value={data.goals?.desired_outcomes} />
      <Field label="Tried that hasn't worked" value={data.goals?.failed_approaches} />
      <Field label="Commitment (1–10)" value={data.goals?.commitment ?? ""} />
    </Block>
  );
}

function PreviousLabsBlock({ data }: { data: IntakeData }) {
  return (
    <Block title="Previous labs">
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
