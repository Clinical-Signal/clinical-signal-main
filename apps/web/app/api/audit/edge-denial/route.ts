/**
 * SEC-6 — Middleware RBAC denial audit (Node runtime; Edge cannot write to Postgres).
 */
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { allowedRolesForPath } from "@/lib/middleware/rbac-routes";
import { getSessionUser } from "@/lib/session";

const bodySchema = z.object({
  path: z.string().min(1).max(256),
});

export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const json: unknown = await req.json();
    body = bodySchema.parse(json);
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.path.startsWith("/dashboard")) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }

  const permitted = allowedRolesForPath(body.path);
  if (permitted.includes(user.role)) {
    return Response.json({ ok: true });
  }

  await writeAudit({
    action: "rbac_denied",
    tenantId: user.tenantId,
    practitionerId: user.practitionerId,
    resourceType: body.path,
    metadata: { role: user.role, layer: "middleware" },
  });

  return Response.json({ ok: true });
}
