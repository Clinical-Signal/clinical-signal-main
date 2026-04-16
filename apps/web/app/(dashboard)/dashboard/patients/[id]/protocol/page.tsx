import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import { listProtocols } from "@/lib/protocols";
import { Page, PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { GenerateProtocolButton } from "./generate-button";

const STATUS_TONE: Record<string, "warning" | "accent" | "success" | "neutral"> = {
  draft: "warning",
  review: "accent",
  finalized: "success",
};

export default async function ProtocolIndexPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, params.id);
  if (!ok) notFound();

  const protocols = await listProtocols(user.tenantId, params.id);

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
        eyebrow="Protocol"
        title="Generate a protocol"
        description="Clinical Signal analyzes intake and completed lab records, then drafts both a clinical protocol and a phased client action plan."
        actions={<GenerateProtocolButton patientId={params.id} />}
      />

      <section>
        <h3 className="text-sm font-semibold text-ink">Versions</h3>
        {protocols.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No protocols yet"
              description="Generate the first one above. You'll be able to edit, version, and export it as a PDF."
            />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {protocols.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0">
                  <Link
                    className="text-sm font-medium text-ink transition-colors hover:text-accent"
                    href={`/dashboard/patients/${params.id}/protocol/${p.id}`}
                  >
                    {p.title}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-subtle">
                    <span>v{p.version}</span>
                    <span>·</span>
                    <span>{new Date(p.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
