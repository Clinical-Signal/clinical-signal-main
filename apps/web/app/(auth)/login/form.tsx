"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useFormState(loginAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
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
          autoComplete="current-password"
          required
          className="rounded border border-slate-300 px-3 py-2"
        />
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
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
