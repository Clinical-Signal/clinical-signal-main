import { apiAuth } from "@/lib/auth";
import { ERROR_CODES } from "@/lib/api-error";
import { subscribeIntakeCompleted } from "@/lib/intake/intake-events";

// Long-lived stream: must run on the Node runtime and never be statically
// optimized/cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream of intake-completed signals for the authenticated
 * practitioner's tenant. The dashboard subscribes and calls router.refresh() on
 * each `intake_completed` event. Tenant-scoped via the session, so one
 * practitioner never sees another tenant's activity. Note: same `text/event-stream`
 * + ReadableStream pattern already used by the analyze/prep-brief routes.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await apiAuth();
  if (!user) {
    return Response.json(
      { error: ERROR_CODES.NOT_AUTHENTICATED },
      { status: 401 },
    );
  }

  const tenantId = user.tenantId;
  const encoder = new TextEncoder();

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      // Open the stream and hint the client's reconnect backoff.
      send(": connected\nretry: 5000\n\n");

      unsubscribe = subscribeIntakeCompleted(tenantId, (payload) => {
        send(`event: intake_completed\ndata: ${JSON.stringify(payload)}\n\n`);
      });

      // Comment-only heartbeat keeps idle proxies from dropping the connection.
      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable nginx/proxy buffering so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
