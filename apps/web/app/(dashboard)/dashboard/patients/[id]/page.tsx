import Link from "next/link";
import { notFound } from "next/navigation";
import { IntakeLinkStatusBadge } from "@/components/clinician/intake-link-status-badge";
import { SendIntakeButton } from "@/components/clinician/send-intake-button";
import { requireAuth } from "@/lib/auth";
import { getPatientSummary } from "@/lib/intake";
import { getPatientIntakeLinkSnapshot } from "@/lib/intake/get-patient-intake-link-status";
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
  searchParams,
}: {
  params: { id: string };
  searchParams?: { intake_email_failed?: string };
}) {
  const user = await requireAuth();
  const [summary, intakeLink] = await Promise.all([
    getPatientSummary(user.tenantId, params.id),
    getPatientIntakeLinkSnapshot(user.tenantId, params.id),
  ]);
  if (!summary || !intakeLink) notFound();

  const intakeFinished =
    intakeLink.intakeStatus === "step2_complete" ||
    intakeLink.intakeStatus === "reviewed";

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

      {searchParams?.intake_email_failed === "1" ? (
        <p
          className="mb-4 rounded-lg border border-warn bg-warn/10 px-4 py-3 text-sm text-ink"
          role="status"
        >
          Patient was created, but the intake email could not be sent. Check SMTP
          settings and use <strong>Send Intake Link</strong> to try again.
        </p>
      ) : null}

      <PageHeader
        title={summary.name}
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2">
              <StatusDot tone={status.tone} />
              {status.label}
            </span>
            <IntakeLinkStatusBadge status={intakeLink.linkStatus} />
          </span>
        }
        description={summary.dob ? `Date of birth: ${summary.dob}` : "Date of birth not recorded"}
        actions={
          <SendIntakeButton
            patientId={params.id}
            intakeFinished={intakeFinished}
          />
        }
      />

      <section aria-label="Care stages" className="grid gap-4 md:grid-cols-2">
        <HubCard
          title="Intake"
          status={intakeHubStatus(summary, intakeLink.linkStatus)}
          body={
            <div className="space-y-3">
              <IntakeLinkStatusBadge status={intakeLink.linkStatus} />
              <ProgressBar value={summary.intake.completionPct} />
            </div>
          }
          primary={{
            href: `/dashboard/patients/${params.id}/intake`,
            label: "View intake summary",
          }}
          secondary={null}
        />
        <HubCard
          title="Documents & prep brief"
          status={
            summary.prepBrief
              ? `Brief generated ${new Date(summary.prepBrief.generatedAt).toLocaleDateString()}`
              : "No prep brief yet"
          }
          body={
            summary.prepBrief ? (
              <Badge tone="success">Brief ready</Badge>
            ) : null
          }
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
          title="Foundations"
          status={
            summary.foundations
              ? `Assigned ${new Date(summary.foundations.assignedAt).toLocaleDateString()} · ${summary.foundations.itemCount} items`
              : "Not yet assigned"
          }
          body={
            summary.foundations ? (
              <Badge tone="success">Checklist active</Badge>
            ) : (
              <p className="text-xs text-ink-muted">
                Assign foundational habits during the lab waiting period
              </p>
            )
          }
          primary={{
            href: `/dashboard/patients/${params.id}/foundations`,
            label: summary.foundations ? "View checklist" : "Assign checklist",
          }}
          secondary={null}
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

function intakeHubStatus(
  s: {
    intake: { completionPct: number; submittedAt: string | null };
  },
  linkStatus: "pending" | "completed" | "none",
): string {
  if (linkStatus === "completed") {
    return "Patient intake complete";
  }
  if (linkStatus === "pending") {
    return "Intake link sent — awaiting patient";
  }
  if (s.intake.submittedAt) {
    return `Submitted ${new Date(s.intake.submittedAt).toLocaleDateString()}`;
  }
  if (s.intake.completionPct === 0) {
    return "Not started — send a link to begin";
  }
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
