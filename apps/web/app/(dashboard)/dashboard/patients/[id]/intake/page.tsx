import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import { getIntake } from "@/lib/intake";
import { Page, PageHeader } from "@/components/ui/page";
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
        eyebrow="Patient intake"
        title="Capture the baseline"
        description="Each section auto-saves as you type. Submit when you're finished to advance to lab ordering — nothing is locked afterwards."
      />
      <IntakeForm patientId={params.id} initial={initial} />
    </Page>
  );
}
