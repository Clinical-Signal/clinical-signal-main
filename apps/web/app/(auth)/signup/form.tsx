"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signupAction } from "./actions";

export function SignupForm() {
  const [state, action] = useFormState(signupAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input name="name" required className="rounded border border-slate-300 px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          required
          className="rounded border border-slate-300 px-3 py-2"
        />
        <span className="text-xs text-slate-500">
          Minimum 12 characters. Checked against the HaveIBeenPwned breach corpus.
        </span>
      </label>
      {state?.error ? (
        <p className="text-sm text-red-700" role="alert">{state.error}</p>
      ) : null}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Creating account…" : "Create account"}
    </button>
  );
}
