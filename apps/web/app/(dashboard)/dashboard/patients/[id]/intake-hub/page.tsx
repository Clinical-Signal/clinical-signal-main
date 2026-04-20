import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import { listIntakeDocs } from "@/lib/intake-documents";
import { Page, PageHeader } from "@/components/ui/page";
import { IntakeHub } from "./intake-hub";

export default async function IntakeHubPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, params.id);
  if (!ok) notFound();
  const docs = await listIntakeDocs(user.tenantId, params.id);

  return (
    <Page>
      <div className="mb-2 flex items-center gap-3">
        <Link
          href={`/dashboard/patients/${params.id}`}
          className="text-sm text-ink-subtle transition-colors hover:text-ink"
        >
          ← Back to patient
        </Link>
        <Link
          href={`/dashboard/patients/${params.id}/intake`}
          className="text-sm text-ink-subtle transition-colors hover:text-ink"
        >
          Structured intake form →
        </Link>
      </div>
      <PageHeader
        eyebrow="Documents & transcripts"
        title="Intake hub"
        description="Upload call transcripts, lab PDFs, clinical notes, and any other documents. Everything here feeds into protocol generation."
      />
      <IntakeHub patientId={params.id} initialDocs={docs} />
    </Page>
  );
}
