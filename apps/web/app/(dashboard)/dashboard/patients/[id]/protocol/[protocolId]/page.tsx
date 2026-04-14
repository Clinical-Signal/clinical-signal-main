import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import { getProtocol } from "@/lib/protocols";
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

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-100 text-amber-900",
  review: "bg-blue-100 text-blue-900",
  finalized: "bg-emerald-100 text-emerald-900",
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

  const statusClass = STATUS_COLORS[p.status] ?? "bg-slate-100 text-slate-900";

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">{p.title}</h2>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${statusClass}`}
          >
            {p.status}
          </span>
          <span className="text-xs text-slate-500">v{p.version}</span>
        </div>
        <p className="text-xs text-slate-500">
          Generated {new Date(p.createdAt).toLocaleString()}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="rounded border border-slate-200 bg-white p-4">
          <h3 className="mb-4 border-b border-slate-200 pb-2 text-lg font-semibold">
            Output A — Clinical Protocol
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            Practitioner-facing. Full mechanisms, supplement dosages, and
            clinical reasoning.
          </p>
          <RenderSections
            content={p.clinicalContent}
            order={CLINICAL_ORDER}
            skip={["_generation"]}
          />
        </article>

        <article className="rounded border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-4 border-b border-slate-200 pb-2 text-lg font-semibold">
            Output B — Phased Client Action Plan
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            Patient-facing. Plain-language, phased, with expected outcomes.
          </p>
          <RenderSections content={p.clientContent} order={CLIENT_ORDER} />
        </article>
      </div>

      <Link
        className="text-sm underline"
        href={`/dashboard/patients/${params.id}/protocol`}
      >
        ← All protocols for this patient
      </Link>
    </section>
  );
}
