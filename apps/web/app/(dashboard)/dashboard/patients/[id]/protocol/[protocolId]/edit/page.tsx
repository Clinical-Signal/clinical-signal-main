import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import { getProtocol, listProtocolVersions } from "@/lib/protocols";
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
  const versions = await listProtocolVersions(user.tenantId, params.id);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Edit protocol</h2>
          <p className="text-sm text-slate-600">
            Saving creates a new version. Status changes apply to this version
            in place.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            className="text-sm underline"
            href={`/dashboard/patients/${params.id}/protocol/${params.protocolId}`}
          >
            View
          </Link>
          <Link
            className="text-sm underline"
            href={`/dashboard/patients/${params.id}`}
          >
            ← Patient
          </Link>
        </div>
      </header>
      <EditForm
        patientId={params.id}
        protocolId={params.protocolId}
        initialTitle={protocol.title}
        initialStatus={protocol.status}
        initialVersion={protocol.version}
        initialClinical={protocol.clinicalContent}
        initialClient={protocol.clientContent}
        versions={versions.map((v) => ({
          id: v.id,
          version: v.version,
          status: v.status,
          createdAt: v.createdAt.toISOString(),
        }))}
      />
    </section>
  );
}
