import Link from "next/link";
import { Page, PageHeader } from "@/components/ui/page";
import { NewPatientForm } from "./form";

export default function NewPatientPage() {
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
        eyebrow="New patient"
        title="Add a patient"
        description="Name and date of birth are encrypted at rest. You'll capture the rest through the intake form."
      />
      <div className="max-w-xl">
        <NewPatientForm />
      </div>
    </Page>
  );
}
