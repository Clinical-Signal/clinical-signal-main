import type { SessionUser } from "@/lib/session";

/** Denied role for SEC-6 server-action RBAC tests. */
export const viewerSession: SessionUser = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  practitionerId: "00000000-0000-0000-0000-000000000098",
  sessionId: "00000000-0000-0000-0000-000000000097",
  role: "viewer",
  lifecycleStatus: "active",
  email: "viewer@example.com",
  name: "Viewer Test",
};
