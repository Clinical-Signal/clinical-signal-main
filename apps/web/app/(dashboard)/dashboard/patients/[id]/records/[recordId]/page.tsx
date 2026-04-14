import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getRecord, patientBelongsToTenant, type StructuredLabData } from "@/lib/records";
import { LabReviewTable } from "./review-table";

export default async function RecordReviewPage({
  params,
}: {
  params: { id: string; recordId: string };
}) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, params.id);
  if (!ok) notFound();

  const rec = await getRecord(user.tenantId, params.recordId);
  if (!rec) notFound();

  const data = rec.structuredData as StructuredLabData;
  const labs = data.labs ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">Review extracted labs</h2>
        <p className="text-sm text-slate-600">
          {labs.length} value{labs.length === 1 ? "" : "s"} extracted. Correct any
          errors and save.
        </p>
        {data.extraction_confidence ? (
          <p className="text-xs text-slate-500">
            Extraction confidence: {data.extraction_confidence}
            {data.notes ? ` — ${data.notes}` : null}
          </p>
        ) : null}
      </div>

      <LabReviewTable recordId={rec.id} initialLabs={labs} />

      <Link
        className="text-sm underline"
        href={`/dashboard/patients/${params.id}/records`}
      >
        Back to records
      </Link>
    </section>
  );
}
