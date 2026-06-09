import { NextResponse } from "next/server";

import { writeAudit } from "@/lib/audit/write-audit";
import { apiAuth } from "@/lib/auth";
import { enforceCapability } from "@/lib/auth/require-role";
import { patientBelongsToTenant } from "@/lib/records";
import { IntakeTokenError } from "@/lib/tokens/intake-token";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

export async function POST(
  _request: Request,
  ctx: { params: { id: string } },
): Promise<Response> {
  const user = await apiAuth();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const denied = await enforceCapability(user, "issue_intake_token");
  if (denied) return denied;

  const patientId = ctx.params.id;
  const belongs = await patientBelongsToTenant(user.tenantId, patientId);
  if (!belongs) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const minted = await getIntakeTokenService().mint({
      patientId,
      tenantId: user.tenantId,
      createdBy: user.practitionerId,
    });

    await writeAudit({
      tenantId: user.tenantId,
      actorId: user.practitionerId,
      action: "intake_token_minted",
      entity: "token",
      entityId: minted.tokenId,
      payload: {
        patientId,
      },
    });

    return NextResponse.json({
      token: minted.token,
      tokenId: minted.tokenId,
      expiresAt: minted.expiresAt.toISOString(),
      intakeUrl: `/intake/${minted.token}`,
    });
  } catch (error) {
    if (error instanceof IntakeTokenError && error.code === "active_token_exists") {
      return NextResponse.json({ error: "ACTIVE_TOKEN_EXISTS" }, { status: 409 });
    }

    console.error("[intake-token] mint failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
