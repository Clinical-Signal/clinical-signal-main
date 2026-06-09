import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can } from "@clinical-signal/shared";
import { requireAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import { getProtocol, listProtocolVersions } from "@/lib/protocols";
import { Page, PageHeader } from "@/components/ui/page";
import { EditForm } from "./edit-form";

export default async function ProtocolEditPage({
  params,
}: {
  params: { id: string; protocolId: string };
}) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, params.id);
  if (!ok) notFound();
  const protocol = await getProtocol(user.tenantId, params.protocolId);
  if (!protocol || protocol.patientId !== params.id) notFound();
  if (!can(user.role, "edit_protocol")) {
    redirect(`/dashboard/patients/${params.id}/protocol/${params.protocolId}`);
  }
  const versions = await listProtocolVersions(user.tenantId, params.id);

  return (
    <Page>
      <div className="mb-2 flex items-center gap-3">
        <Link
          href={`/dashboard/patients/${params.id}/protocol/${params.protocolId}`}
          className="text-sm text-ink-subtle transition-colors hover:text-ink"
        >
          ← Back to view
        </Link>
      </div>
      <PageHeader
        eyebrow="Editor"
        title="Edit protocol"
        description="Save creates a new version (history is retained). Status changes apply to this version in place."
      />
      <EditForm
        patientId={params.id}
        protocolId={params.protocolId}
        initialTitle={protocol.title}
        initialStatus={protocol.status}
        initialVersion={protocol.version}
        initialClinical={protocol.clinicalContent}
        initialClient={protocol.clientContent}
        canRegenerate={can(user.role, "generate_protocol")}
        canFinalize={can(user.role, "finalize_protocol")}
        canDeliver={can(user.role, "deliver_protocol")}
        canEditDialogue={can(user.role, "edit_protocol")}
        versions={versions.map((v) => ({
          id: v.id,
          version: v.version,
          status: v.status,
          createdAt: v.createdAt.toISOString(),
        }))}
      />
    </Page>
  );
}
