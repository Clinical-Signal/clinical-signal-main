"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createPatientAction } from "./actions";

export function NewPatientForm() {
  const [state, action] = useFormState(createPatientAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Full name
        <input
          name="name"
          required
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Date of birth
        <input
          type="date"
          name="dob"
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Private notes
        <textarea
          name="notes"
          rows={3}
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>
      {state?.error ? (
        <p className="text-sm text-red-700" role="alert">{state.error}</p>
      ) : null}
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-start rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Creating…" : "Create patient"}
    </button>
  );
}
