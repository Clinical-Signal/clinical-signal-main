"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { signupAction } from "./actions";

export function SignupForm() {
  const [state, action] = useFormState(signupAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Your name" htmlFor="signup-name">
        <Input id="signup-name" name="name" required />
      </Field>
      <Field label="Email" htmlFor="signup-email">
        <Input
          id="signup-email"
          type="email"
          name="email"
          autoComplete="email"
          required
        />
      </Field>
      <Field
        label="Password"
        htmlFor="signup-password"
        hint="Minimum 12 characters. Checked against the HaveIBeenPwned breach corpus."
      >
        <Input
          id="signup-password"
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          required
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
    <Button type="submit" loading={pending} loadingText="Creating account…">
      Create account
    </Button>
  );
}
