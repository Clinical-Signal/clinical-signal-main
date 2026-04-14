"use client";

import { useFormState, useFormStatus } from "react-dom";
import { requestResetAction } from "./actions";

export function ResetForm() {
  const [state, action] = useFormState(requestResetAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
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
      {state?.message ? (
        <p className="text-sm text-slate-700" role="status">{state.message}</p>
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
      {pending ? "Sending…" : "Send reset link"}
    </button>
  );
}
