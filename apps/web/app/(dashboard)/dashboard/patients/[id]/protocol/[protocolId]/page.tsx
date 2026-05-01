import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import { getProtocol } from "@/lib/protocols";
import { Page, PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { RenderSections } from "./render";
import { ApproveButton } from "./approve-button";

const CLINICAL_ORDER = [
  "summary_of_findings",
  "systems_analysis",
  "daily_protocol",
  "dietary_recommendations",
  "supplement_protocol",
  "lifestyle_modifications",
  "oral_nasal_protocol",
  "lab_retesting",
  "follow_up_timeline",
  "clinical_reasoning",
  "areas_of_uncertainty",
];

const CLIENT_ORDER = [
  "intro",
  "layers",   // v2 prompt uses "layers"
  "phases",   // v1 fallback
  "closing_note",
  "if_something_feels_off",
];

const STATUS_TONE: Record<string, "warning" | "accent" | "success" | "neutral"> = {
  draft: "warning",
  review: "accent",
  finalized: "success",
  approved: "success",
  superseded: "neutral",
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
            {p.status !== "superseded" && (
              <Link
                href={`/dashboard/patients/${params.id}/protocol/${params.protocolId}/edit`}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
              >
                Edit
              </Link>
            )}
            {p.status === "approved" && (
              <Link
                href={`/dashboard/patients/${params.id}/protocol/${params.protocolId}/outputs`}
                className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                View outputs
              </Link>
            )}
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
            {p.status !== "approved" && p.status !== "superseded" && (
              <ApproveButton
                patientId={params.id}
                protocolId={params.protocolId}
              />
            )}
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
            skip={["_generation", "safety_review"]}
          />

          {/* Safety review (if present from updated prompts) */}
          {typeof (p.clinicalContent as Record<string, unknown>).safety_review === "object" &&
            (p.clinicalContent as Record<string, unknown>).safety_review !== null && (
            <div className="mt-6 rounded-lg border border-accent-soft bg-accent-soft/10 p-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">Safety review</h3>
              <RenderSections
                content={(p.clinicalContent as Record<string, unknown>).safety_review as Record<string, unknown>}
                order={["drug_interactions_checked", "contraindications_noted", "dose_ceiling_compliance", "pregnancy_nursing_safe"]}
              />
            </div>
          )}
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

      {/* Disclaimer */}
      <div className="mt-6 border-t border-line pt-4">
        <p className="text-xs text-ink-faint">
          This protocol was generated with AI assistance and is intended as a clinical
          decision-support tool. It requires practitioner review, clinical judgment, and
          approval before implementation. It is not a substitute for professional medical
          evaluation.
        </p>
      </div>
    </Page>
  );
}
