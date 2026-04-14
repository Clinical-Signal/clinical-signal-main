import Link from "next/link";
import { NewPatientForm } from "./form";

export default function NewPatientPage() {
  return (
    <section className="flex max-w-xl flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">New patient</h2>
        <p className="text-sm text-slate-600">
          Name and DOB are stored encrypted at rest.
        </p>
      </div>
      <NewPatientForm />
      <Link className="text-sm underline" href="/dashboard">
        Back to dashboard
      </Link>
    </section>
  );
}
