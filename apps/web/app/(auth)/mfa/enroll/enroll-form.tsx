"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import {
  confirmEnrollmentAction,
  type MfaEnrollState,
} from "./actions";

export function EnrollForm() {
  const [state, action] = useFormState(confirmEnrollmentAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Verification code" htmlFor="mfa-enroll-code">
        <Input
          id="mfa-enroll-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          placeholder="000000"
        />
      </Field>
      {state?.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingText="Confirming…">
      Confirm enrollment
    </Button>
  );
}
