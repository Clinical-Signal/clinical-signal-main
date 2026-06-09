import Link from "next/link";
import { notFound } from "next/navigation";

import { PatientIntakeSummary } from "@/components/clinician/patient-intake-summary";
import { Page, PageHeader } from "@/components/ui/page";
import { writeAudit } from "@/lib/audit/write-audit";
import { requireAuth } from "@/lib/auth";
import { loadPatientIntakeSummary } from "@/lib/intake/load-patient-intake-summary";
import { getPatientSummary } from "@/lib/intake";
import { patientBelongsToTenant } from "@/lib/records";

export default async function PatientIntakeSummaryPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, params.id);
  if (!ok) notFound();

  const [summary, intake] = await Promise.all([
    getPatientSummary(user.tenantId, params.id),
    loadPatientIntakeSummary(user.tenantId, params.id),
  ]);

  if (!summary || !intake) notFound();

  await writeAudit({
    tenantId: user.tenantId,
    actorId: user.practitionerId,
    action: "intake_clinician_dashboard_viewed",
    entity: "patient",
    entityId: params.id,
    payload: {
      intakeStatus: intake.state.intakeStatus,
      hasChatMessages: intake.chatMessages.length > 0,
    },
  });

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
        title="Intake summary"
        description="Read-only view of submitted Step 1 answers and Step 2 follow-up chat responses."
      />
      <PatientIntakeSummary
        intakeStatus={intake.state.intakeStatus}
        intakeData={intake.state.intakeData}
        chatMessages={intake.chatMessages}
        patientName={summary.name}
      />
    </Page>
  );
}
