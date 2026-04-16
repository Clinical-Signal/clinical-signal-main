"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useFormState(loginAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="login-email">
        <Input
          id="login-email"
          type="email"
          name="email"
          autoComplete="email"
          required
        />
      </Field>
      <Field label="Password" htmlFor="login-password">
        <Input
          id="login-password"
          type="password"
          name="password"
          autoComplete="current-password"
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
    <Button type="submit" loading={pending} loadingText="Signing in…">
      Sign in
    </Button>
  );
}
