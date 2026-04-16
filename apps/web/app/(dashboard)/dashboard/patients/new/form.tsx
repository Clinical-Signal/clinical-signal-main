"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { createPatientAction } from "./actions";

export function NewPatientForm() {
  const [state, action] = useFormState(createPatientAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Full name" htmlFor="patient-name">
        <Input id="patient-name" name="name" required />
      </Field>
      <Field
        label="Date of birth"
        htmlFor="patient-dob"
        hint="Optional, but useful for age-based reference ranges."
      >
        <Input id="patient-dob" type="date" name="dob" />
      </Field>
      <Field
        label="Private notes"
        htmlFor="patient-notes"
        hint="Visible only to you. Referral source, first-call impressions — whatever helps you remember."
      >
        <Textarea id="patient-notes" name="notes" rows={3} />
      </Field>
      {state?.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <div>
      <Button type="submit" loading={pending} loadingText="Creating…">
        Create patient
      </Button>
    </div>
  );
}
