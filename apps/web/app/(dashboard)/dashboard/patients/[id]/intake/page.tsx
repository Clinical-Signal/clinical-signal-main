import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import { getIntake } from "@/lib/intake";
import { IntakeForm } from "./form";

export default async function IntakeFormPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, params.id);
  if (!ok) notFound();
  const initial = await getIntake(user.tenantId, params.id);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Patient intake</h2>
          <p className="text-sm text-slate-600">
            Each section auto-saves as you complete it. Submit when finished to
            advance the patient to lab ordering.
          </p>
        </div>
        <Link
          className="text-sm underline"
          href={`/dashboard/patients/${params.id}`}
        >
          ← Back to patient
        </Link>
      </header>
      <IntakeForm patientId={params.id} initial={initial} />
    </section>
  );
}
