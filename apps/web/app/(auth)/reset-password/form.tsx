"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { requestResetAction } from "./actions";

export function ResetForm() {
  const [state, action] = useFormState(requestResetAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email" htmlFor="reset-email">
        <Input
          id="reset-email"
          type="email"
          name="email"
          autoComplete="email"
          required
        />
      </Field>
      {state?.message ? (
        <p className="text-sm text-ink-muted" role="status">
          {state.message}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingText="Sending…">
      Send reset link
    </Button>
  );
}
