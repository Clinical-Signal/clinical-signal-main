import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { listPatients } from "@/lib/patients";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Page, PageHeader } from "@/components/ui/page";

const STATUS_COPY: Record<
  string,
  { label: string; tone: "neutral" | "accent" | "warning" | "success" | "danger" }
> = {
  new: { label: "New", tone: "neutral" },
  intake_pending: { label: "Intake in progress", tone: "warning" },
  labs_pending: { label: "Labs pending", tone: "warning" },
  analysis_ready: { label: "Ready for analysis", tone: "accent" },
  protocol_draft: { label: "Protocol draft", tone: "accent" },
  active: { label: "Active", tone: "success" },
  archived: { label: "Archived", tone: "neutral" },
};

export default async function DashboardPage() {
  const user = await requireAuth();
  const patients = await listPatients(user.tenantId);

  return (
    <Page>
      <PageHeader
        title="Patients"
        description={
          patients.length === 0
            ? undefined
            : `${patients.length} patient${patients.length === 1 ? "" : "s"}`
        }
        actions={
          <Link href="/dashboard/patients/new">
            <Button>New patient</Button>
          </Link>
        }
      />

      {patients.length === 0 ? (
        <EmptyState
          title="No patients yet"
          description="Create your first patient to start capturing intake data and building protocols."
          action={
            <Link href="/dashboard/patients/new">
              <Button>Add a patient</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-sunken/50 text-left text-xs font-medium uppercase tracking-wide text-ink-subtle">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="hidden px-5 py-3 font-medium sm:table-cell">DOB</th>
                <th className="hidden px-5 py-3 font-medium sm:table-cell">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {patients.map((p) => {
                const status = STATUS_COPY[p.status] ?? {
                  label: p.status,
                  tone: "neutral" as const,
                };
                return (
                  <tr
                    key={p.id}
                    className="group transition-colors hover:bg-surface-sunken/60"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/dashboard/patients/${p.id}`}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2 text-ink-muted">
                        <StatusDot tone={status.tone} />
                        {status.label}
                      </span>
                    </td>
                    <td className="hidden px-5 py-3 text-ink-muted sm:table-cell">
                      {p.dob ?? "—"}
                    </td>
                    <td className="hidden px-5 py-3 text-ink-subtle sm:table-cell">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
