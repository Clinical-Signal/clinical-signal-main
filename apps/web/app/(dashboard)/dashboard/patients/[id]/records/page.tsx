import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { listRecords, patientBelongsToTenant } from "@/lib/records";
import { RecordsList } from "./records-list";
import { UploadForm } from "./upload-form";

export default async function PatientRecordsPage({ params }: { params: { id: string } }) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, params.id);
  if (!ok) notFound();
  const initial = await listRecords(user.tenantId, params.id);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Records</h2>
          <p className="text-sm text-slate-600">Upload lab PDFs for structured extraction.</p>
        </div>
        <div className="flex items-center gap-4">
          <Link className="text-sm underline" href={`/dashboard/patients/${params.id}/protocol`}>
            Protocol →
          </Link>
          <Link className="text-sm underline" href="/dashboard">Back to patients</Link>
        </div>
      </div>

      <UploadForm patientId={params.id} />

      <RecordsList patientId={params.id} initial={initial} />
    </section>
  );
}
