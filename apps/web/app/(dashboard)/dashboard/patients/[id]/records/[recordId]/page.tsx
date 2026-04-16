import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getRecord, patientBelongsToTenant, type StructuredLabData } from "@/lib/records";
import { Page, PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { LabReviewTable } from "./review-table";

const CONFIDENCE_TONE: Record<string, "success" | "accent" | "warning"> = {
  high: "success",
  medium: "accent",
  low: "warning",
};

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
  const flagged = labs.filter((l) => l.flag === "high" || l.flag === "low").length;

  return (
    <Page>
      <div className="mb-2">
        <Link
          href={`/dashboard/patients/${params.id}/records`}
          className="text-sm text-ink-subtle transition-colors hover:text-ink"
        >
          ← All records
        </Link>
      </div>
      <PageHeader
        eyebrow="Lab review"
        title="Review extracted values"
        description={
          labs.length === 0
            ? "Nothing extracted yet."
            : `${labs.length} value${labs.length === 1 ? "" : "s"} extracted${
                flagged > 0 ? ` · ${flagged} out of range` : ""
              }.`
        }
        actions={
          data.extraction_confidence ? (
            <Badge tone={CONFIDENCE_TONE[data.extraction_confidence] ?? "neutral"}>
              {data.extraction_confidence} confidence
            </Badge>
          ) : null
        }
      />

      {data.notes ? (
        <p className="mb-4 max-w-prose rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
          {data.notes}
        </p>
      ) : null}

      <LabReviewTable recordId={rec.id} initialLabs={labs} />
    </Page>
  );
}
