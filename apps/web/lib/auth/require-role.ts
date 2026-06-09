/**
 * SEC-6 — server-side RBAC gate (PRD §5.6).
 * Step 2.3 wires middleware; Step 2.3+ server actions call requireCapability.
 */
import { writeAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";
import { can, type Capability } from "@clinical-signal/shared";

export class RbacDeniedError extends Error {
  readonly status = 403 as const;
  readonly capability: Capability;

  constructor(capability: Capability) {
    super("Forbidden");
    this.name = "RbacDeniedError";
    this.capability = capability;
  }
}

export async function requireCapability(
  session: SessionUser,
  cap: Capability,
): Promise<void> {
  if (can(session.role, cap)) return;

  await writeAudit({
    action: "rbac_denied",
    tenantId: session.tenantId,
    practitionerId: session.practitionerId,
    resourceType: cap,
    metadata: { role: session.role },
  });

  throw new RbacDeniedError(cap);
}

/** SEC-6 — Route Handler helper: returns 403 JSON instead of throwing. */
export function rbacForbiddenResponse(): Response {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

export async function enforceCapability(
  session: SessionUser,
  cap: Capability,
): Promise<Response | null> {
  try {
    await requireCapability(session, cap);
    return null;
  } catch (err) {
    if (err instanceof RbacDeniedError) {
      return rbacForbiddenResponse();
    }
    throw err;
  }
}
