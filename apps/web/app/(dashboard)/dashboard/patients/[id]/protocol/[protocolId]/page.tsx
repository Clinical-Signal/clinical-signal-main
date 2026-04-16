import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import { getProtocol } from "@/lib/protocols";
import { Page, PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { RenderSections } from "./render";

const CLINICAL_ORDER = [
  "summary_of_findings",
  "systems_analysis",
  "dietary_recommendations",
  "supplement_protocol",
  "lifestyle_modifications",
  "lab_retesting",
  "follow_up_timeline",
  "clinical_reasoning",
  "areas_of_uncertainty",
];

const CLIENT_ORDER = [
  "intro",
  "phases",
  "closing_note",
  "if_something_feels_off",
];

const STATUS_TONE: Record<string, "warning" | "accent" | "success" | "neutral"> = {
  draft: "warning",
  review: "accent",
  finalized: "success",
};

export default async function ProtocolViewPage({
  params,
}: {
  params: { id: string; protocolId: string };
}) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, params.id);
  if (!ok) notFound();

  const p = await getProtocol(user.tenantId, params.protocolId);
  if (!p || p.patientId !== params.id) notFound();

  return (
    <Page>
      <div className="mb-2">
        <Link
          href={`/dashboard/patients/${params.id}/protocol`}
          className="text-sm text-ink-subtle transition-colors hover:text-ink"
        >
          ← All versions
        </Link>
      </div>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-3">
            <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
            <span>v{p.version}</span>
            <span>·</span>
            <span>Generated {new Date(p.createdAt).toLocaleString()}</span>
          </span>
        }
        title={p.title}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/patients/${params.id}/protocol/${params.protocolId}/edit`}
              className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
            >
              Edit
            </Link>
            <a
              href={`/api/patients/${params.id}/protocol/${params.protocolId}/export?audience=clinical`}
              className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
            >
              Clinical PDF
            </a>
            <a
              href={`/api/patients/${params.id}/protocol/${params.protocolId}/export?audience=client`}
              className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent-hover"
            >
              Client PDF
            </a>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-xl border border-line bg-surface p-6">
          <header className="mb-4 border-b border-line pb-3">
            <h2 className="text-lg font-semibold text-ink">Output A · Clinical protocol</h2>
            <p className="mt-1 text-xs text-ink-subtle">
              Practitioner copy. Mechanisms, dosages, clinical reasoning.
            </p>
          </header>
          <RenderSections
            content={p.clinicalContent}
            order={CLINICAL_ORDER}
            skip={["_generation"]}
          />
        </article>

        <article className="rounded-xl border border-line bg-surface-sunken/40 p-6">
          <header className="mb-4 border-b border-line pb-3">
            <h2 className="text-lg font-semibold text-ink">Output B · Client action plan</h2>
            <p className="mt-1 text-xs text-ink-subtle">
              Patient copy. Plain language, phased, with desired outcomes.
            </p>
          </header>
          <RenderSections content={p.clientContent} order={CLIENT_ORDER} />
        </article>
      </div>
    </Page>
  );
}
