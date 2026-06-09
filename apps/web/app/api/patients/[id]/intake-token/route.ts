import { NextResponse } from "next/server";

import { writeAudit } from "@/lib/audit/write-audit";
import { patientBelongsToTenant } from "@/lib/auth/patient-belongs-to-tenant";
import { requireAuth } from "@/lib/auth/require-auth";
import { IntakeTokenError } from "@/lib/tokens/intake-token";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

export async function POST(
  _request: Request,
  ctx: { params: { id: string } },
): Promise<Response> {
  let session;
  try {
    session = await requireAuth();
  } catch {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const patientId = ctx.params.id;
  const belongs = await patientBelongsToTenant(patientId, session.tenantId);
  if (!belongs) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const minted = await getIntakeTokenService().mint({
      patientId,
      tenantId: session.tenantId,
      createdBy: session.userId,
    });

    await writeAudit({
      tenantId: session.tenantId,
      actorId: session.userId,
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
