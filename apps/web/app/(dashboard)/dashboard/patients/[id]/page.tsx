import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getPatientSummary } from "@/lib/intake";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  intake_pending: "Intake pending",
  labs_pending: "Labs pending",
  analysis_ready: "Ready for analysis",
  protocol_draft: "Protocol draft",
  active: "Active",
  archived: "Archived",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-800",
  intake_pending: "bg-amber-100 text-amber-900",
  labs_pending: "bg-amber-100 text-amber-900",
  analysis_ready: "bg-blue-100 text-blue-900",
  protocol_draft: "bg-blue-100 text-blue-900",
  active: "bg-emerald-100 text-emerald-900",
  archived: "bg-slate-100 text-slate-600",
};

export default async function PatientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireAuth();
  const summary = await getPatientSummary(user.tenantId, params.id);
  if (!summary) notFound();

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{summary.name}</h2>
          <p className="text-sm text-slate-600">
            {summary.dob ? `DOB ${summary.dob}` : "DOB not recorded"}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_COLORS[summary.status] ?? "bg-slate-100 text-slate-800"
          }`}
        >
          {STATUS_LABELS[summary.status] ?? summary.status}
        </span>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card
          title="Intake"
          status={
            summary.intake.submittedAt
              ? `Submitted ${new Date(summary.intake.submittedAt).toLocaleDateString()}`
              : `${summary.intake.completionPct}% complete`
          }
          href={
            summary.intake.submittedAt
              ? `/dashboard/patients/${params.id}/intake/review`
              : `/dashboard/patients/${params.id}/intake`
          }
          ctaLabel={summary.intake.submittedAt ? "Review intake" : "Continue intake"}
          secondary={
            summary.intake.submittedAt
              ? {
                  label: "Edit",
                  href: `/dashboard/patients/${params.id}/intake`,
                }
              : null
          }
        />
        <Card
          title="Records"
          status={
            summary.recordCount === 0
              ? "No records uploaded"
              : `${summary.recordCount} record${summary.recordCount === 1 ? "" : "s"}`
          }
          href={`/dashboard/patients/${params.id}/records`}
          ctaLabel="Manage records"
        />
        <Card
          title="Protocol"
          status={
            summary.protocol
              ? `${summary.protocol.status} · v${summary.protocol.version}`
              : "Not yet generated"
          }
          href={
            summary.protocol
              ? `/dashboard/patients/${params.id}/protocol/${summary.protocol.id}`
              : `/dashboard/patients/${params.id}/protocol`
          }
          ctaLabel={summary.protocol ? "Open protocol" : "Generate protocol"}
          secondary={
            summary.protocol
              ? {
                  label: "All drafts",
                  href: `/dashboard/patients/${params.id}/protocol`,
                }
              : null
          }
        />
      </div>

      <Link className="text-sm underline" href="/dashboard">
        ← Back to all patients
      </Link>
    </section>
  );
}

function Card({
  title,
  status,
  href,
  ctaLabel,
  secondary,
}: {
  title: string;
  status: string;
  href: string;
  ctaLabel: string;
  secondary?: { label: string; href: string } | null;
}) {
  return (
    <article className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <p className="text-xs text-slate-500">{status}</p>
      <div className="mt-auto flex items-center justify-between gap-2">
        <Link
          href={href}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          {ctaLabel}
        </Link>
        {secondary ? (
          <Link className="text-xs underline" href={secondary.href}>
            {secondary.label}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
