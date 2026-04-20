import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getPatientSummary } from "@/lib/intake";
import { Button } from "@/components/ui/button";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Page, PageHeader } from "@/components/ui/page";

type Tone = "neutral" | "accent" | "warning" | "success" | "danger";

const STATUS_COPY: Record<string, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "neutral" },
  intake_pending: { label: "Intake in progress", tone: "warning" },
  labs_pending: { label: "Labs pending", tone: "warning" },
  analysis_ready: { label: "Ready for analysis", tone: "accent" },
  protocol_draft: { label: "Protocol draft", tone: "accent" },
  active: { label: "Active", tone: "success" },
  archived: { label: "Archived", tone: "neutral" },
};

const PROTOCOL_TONE: Record<string, Tone> = {
  draft: "warning",
  review: "accent",
  finalized: "success",
};

export default async function PatientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireAuth();
  const summary = await getPatientSummary(user.tenantId, params.id);
  if (!summary) notFound();

  const status = STATUS_COPY[summary.status] ?? {
    label: summary.status,
    tone: "neutral" as Tone,
  };

  return (
    <Page>
      <div className="mb-2">
        <Link
          href="/dashboard"
          className="text-sm text-ink-subtle transition-colors hover:text-ink"
        >
          ← All patients
        </Link>
      </div>

      <PageHeader
        title={summary.name}
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <StatusDot tone={status.tone} />
            {status.label}
          </span>
        }
        description={summary.dob ? `Date of birth: ${summary.dob}` : "Date of birth not recorded"}
      />

      <section aria-label="Care stages" className="grid gap-4 md:grid-cols-3">
        <HubCard
          title="Intake"
          status={intakeStatus(summary)}
          body={
            <ProgressBar value={summary.intake.completionPct} />
          }
          primary={{
            href: summary.intake.submittedAt
              ? `/dashboard/patients/${params.id}/intake/review`
              : `/dashboard/patients/${params.id}/intake`,
            label: summary.intake.submittedAt ? "Review intake" : "Continue intake",
          }}
          secondary={
            summary.intake.submittedAt
              ? {
                  href: `/dashboard/patients/${params.id}/intake`,
                  label: "Edit",
                }
              : null
          }
        />
        <HubCard
          title="Documents"
          status="Transcripts, notes, and files"
          body={null}
          primary={{
            href: `/dashboard/patients/${params.id}/intake-hub`,
            label: "Intake hub",
          }}
          secondary={{
            href: `/dashboard/patients/${params.id}/records`,
            label: "Lab records",
          }}
        />
        <HubCard
          title="Protocol"
          status={
            summary.protocol
              ? `v${summary.protocol.version} · ${summary.protocol.status}`
              : "Not yet generated"
          }
          body={
            summary.protocol ? (
              <Badge tone={PROTOCOL_TONE[summary.protocol.status] ?? "neutral"}>
                {summary.protocol.status}
              </Badge>
            ) : null
          }
          primary={{
            href: summary.protocol
              ? `/dashboard/patients/${params.id}/protocol/${summary.protocol.id}`
              : `/dashboard/patients/${params.id}/protocol`,
            label: summary.protocol ? "Open protocol" : "Generate protocol",
          }}
          secondary={
            summary.protocol
              ? {
                  href: `/dashboard/patients/${params.id}/protocol`,
                  label: "All versions",
                }
              : null
          }
        />
      </section>
    </Page>
  );
}

function intakeStatus(s: {
  intake: { completionPct: number; submittedAt: string | null };
}): string {
  if (s.intake.submittedAt)
    return `Submitted ${new Date(s.intake.submittedAt).toLocaleDateString()}`;
  if (s.intake.completionPct === 0) return "Not started";
  return `${s.intake.completionPct}% complete`;
}

function HubCard({
  title,
  status,
  body,
  primary,
  secondary,
}: {
  title: string;
  status: string;
  body: React.ReactNode;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string } | null;
}) {
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-xs text-ink-subtle">{status}</p>
      </div>
      {body ? <div>{body}</div> : <div className="flex-1" />}
      <div className="mt-auto flex items-center justify-between gap-3">
        <Link href={primary.href}>
          <Button variant="secondary" size="sm">
            {primary.label}
          </Button>
        </Link>
        {secondary ? (
          <Link
            className="text-xs text-ink-subtle transition-colors hover:text-ink"
            href={secondary.href}
          >
            {secondary.label}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
    >
      <div
        className="h-full bg-accent transition-all"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
