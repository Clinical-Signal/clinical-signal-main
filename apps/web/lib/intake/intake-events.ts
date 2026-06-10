import { EventEmitter } from "node:events";

/**
 * Lightweight in-process pub/sub for "intake completed" signals, used to push
 * live dashboard updates over SSE (see app/api/intake/events/route.ts).
 *
 * IMPORTANT — single-instance only. This emitter lives in the Node process, so
 * it fans out to SSE subscribers connected to the SAME instance. It does NOT
 * cross process boundaries. For a horizontally-scaled deploy, back this with
 * Redis pub/sub (or Postgres LISTEN/NOTIFY) — the emit/subscribe surface below
 * can stay identical, only the transport changes. The dashboard also runs a
 * slow fallback refresh, so a missed event degrades to eventual consistency,
 * never a stuck UI.
 */

export type IntakeCompletedEvent = {
  patientId: string;
  submittedAt: string;
};

// Reuse a single emitter across HMR reloads / route bundles in dev by stashing
// it on globalThis (same pattern as a shared DB pool singleton).
const globalForEvents = globalThis as unknown as {
  __intakeEventEmitter?: EventEmitter;
};

const emitter =
  globalForEvents.__intakeEventEmitter ??
  (globalForEvents.__intakeEventEmitter = new EventEmitter());

// Many dashboard tabs may subscribe to the same tenant channel concurrently;
// lift the default 10-listener warning cap.
emitter.setMaxListeners(0);

function channel(tenantId: string): string {
  return `intake_completed:${tenantId}`;
}

/** Notify same-process SSE subscribers that an intake was finalized. */
export function emitIntakeCompleted(
  tenantId: string,
  event: IntakeCompletedEvent,
): void {
  emitter.emit(channel(tenantId), event);
}

/** Subscribe to a tenant's intake-completed events. Returns an unsubscribe fn. */
export function subscribeIntakeCompleted(
  tenantId: string,
  listener: (event: IntakeCompletedEvent) => void,
): () => void {
  const ch = channel(tenantId);
  emitter.on(ch, listener);
  return () => {
    emitter.off(ch, listener);
  };
}
