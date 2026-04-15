import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { listPatients } from "@/lib/patients";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  intake_pending: "Intake pending",
  labs_pending: "Labs pending",
  analysis_ready: "Ready for analysis",
  protocol_draft: "Protocol draft",
  active: "Active",
  archived: "Archived",
};

export default async function DashboardPage() {
  const user = await requireAuth();
  const patients = await listPatients(user.tenantId);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Patients</h2>
          <p className="text-sm text-slate-600">
            {patients.length === 0
              ? "No patients yet."
              : `${patients.length} patient${patients.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Link
          href="/dashboard/patients/new"
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          New patient
        </Link>
      </header>

      {patients.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 p-6 text-sm text-slate-600">
          Create your first patient to get started.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {patients.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link
                  href={`/dashboard/patients/${p.id}`}
                  className="font-medium hover:underline"
                >
                  {p.name}
                </Link>
                <div className="text-xs text-slate-500">
                  {p.dob ? `DOB ${p.dob}` : "DOB not recorded"}
                  {" · "}Updated {new Date(p.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {STATUS_LABELS[p.status] ?? p.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
