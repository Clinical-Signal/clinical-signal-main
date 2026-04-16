"use client";

import { logoutAction } from "./logout-action";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="text-ink-subtle transition-colors hover:text-ink"
      >
        Sign out
      </button>
    </form>
  );
}
