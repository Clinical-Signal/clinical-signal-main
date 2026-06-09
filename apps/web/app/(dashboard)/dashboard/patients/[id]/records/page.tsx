import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@clinical-signal/shared";
import { requireAuth } from "@/lib/auth";
import { listRecords, patientBelongsToTenant } from "@/lib/records";
import { Page, PageHeader } from "@/components/ui/page";
import { RecordsList } from "./records-list";
import { UploadForm } from "./upload-form";

export default async function PatientRecordsPage({ params }: { params: { id: string } }) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, params.id);
  if (!ok) notFound();
  const initial = await listRecords(user.tenantId, params.id);
  const canUploadLab = can(user.role, "upload_lab");

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
        eyebrow="Lab records"
        title="Records"
        description="Upload PDF lab reports — Clinical Signal extracts structured values for review."
      />

      <div className="flex flex-col gap-6">
        {canUploadLab ? <UploadForm patientId={params.id} /> : null}
        <RecordsList patientId={params.id} initial={initial} />
      </div>
    </Page>
  );
}
