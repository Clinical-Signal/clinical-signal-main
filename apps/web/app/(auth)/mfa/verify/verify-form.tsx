"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { verifyChallengeAction, type MfaVerifyState } from "./actions";

export function VerifyForm() {
  const [state, action] = useFormState(verifyChallengeAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Authentication code" htmlFor="mfa-verify-code">
        <Input
          id="mfa-verify-code"
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
    <Button type="submit" loading={pending} loadingText="Verifying…">
      Verify and continue
    </Button>
  );
}
