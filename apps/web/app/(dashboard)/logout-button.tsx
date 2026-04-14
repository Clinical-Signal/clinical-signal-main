"use client";

import { logoutAction } from "./logout-action";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="text-slate-600 underline hover:text-slate-900">
        Sign out
      </button>
    </form>
  );
}
