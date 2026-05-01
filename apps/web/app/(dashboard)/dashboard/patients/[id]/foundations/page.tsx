import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getPatientSummary } from "@/lib/intake";
import { Page, PageHeader } from "@/components/ui/page";
import { FoundationsEditor } from "./foundations-editor";

export default async function FoundationsPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireAuth();
  const summary = await getPatientSummary(user.tenantId, params.id);
  if (!summary) notFound();

  return (
    <Page>
      <div className="mb-2">
        <Link
          href={`/dashboard/patients/${params.id}`}
          className="text-sm text-ink-subtle transition-colors hover:text-ink"
        >
          ← {summary.name}
        </Link>
      </div>

      <PageHeader
        title="Foundational checklist"
        description={
          "Assign foundational habits for " +
          summary.name +
          " to work on during the lab waiting period. These build the daily routines " +
          "that support protocol adherence later."
        }
      />

      <FoundationsEditor patientId={params.id} />
    </Page>
  );
}
