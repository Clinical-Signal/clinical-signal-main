"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const FALLBACK_REFRESH_MS = 60_000;

/**
 * Subscribes to the tenant's intake-completed SSE stream and silently re-runs
 * the dashboard server component (router.refresh) when a patient finishes their
 * intake — no manual reload, no client-side list state to keep in sync.
 *
 * EventSource auto-reconnects on drop. A slow fallback refresh covers the gaps
 * SSE can't guarantee on its own (a missed event, or a multi-instance deploy
 * without shared pub/sub), and only fires while the tab is visible.
 */
export function IntakeLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource("/api/intake/events");
    source.addEventListener("intake_completed", () => {
      router.refresh();
    });

    const fallback = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, FALLBACK_REFRESH_MS);

    return () => {
      source.close();
      window.clearInterval(fallback);
    };
  }, [router]);

  return null;
}
