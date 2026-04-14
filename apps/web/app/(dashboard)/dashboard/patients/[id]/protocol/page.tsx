import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import { listProtocols } from "@/lib/protocols";
import { GenerateProtocolButton } from "./generate-button";

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
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Protocol</h2>
        <p className="text-sm text-slate-600">
          Generate a clinical protocol and a phased client action plan from this
          patient&apos;s intake and completed records.
        </p>
      </div>

      <GenerateProtocolButton patientId={params.id} />

      <div>
        <h3 className="text-sm font-semibold text-slate-700">Previous drafts</h3>
        {protocols.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No protocols yet for this patient.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 rounded border border-slate-200">
            {protocols.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2">
                <div>
                  <Link
                    className="text-sm font-medium underline"
                    href={`/dashboard/patients/${params.id}/protocol/${p.id}`}
                  >
                    {p.title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    v{p.version} · {p.status} ·{" "}
                    {new Date(p.createdAt).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        className="text-sm underline"
        href={`/dashboard/patients/${params.id}/records`}
      >
        ← Back to records
      </Link>
    </section>
  );
}
