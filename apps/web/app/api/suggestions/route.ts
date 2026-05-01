import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { apiError, ERROR_CODES } from "@/lib/api-error";
import {
  getPendingSuggestions,
  acceptSuggestion,
  dismissSuggestion,
} from "@/lib/pattern-recognition";

/** List pending suggested preferences for the current practitioner. */
export async function GET() {
  try {
    const user = await apiAuth();
    if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);

    const suggestions = await getPendingSuggestions(user.tenantId, user.practitionerId);
    return NextResponse.json({ suggestions });
  } catch (err) {
    return apiError(ERROR_CODES.INTERNAL_ERROR, 500, err);
  }
}

/** Accept or dismiss a suggested preference. */
export async function POST(req: Request) {
  try {
    const user = await apiAuth();
    if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);

    const body = (await req.json()) as {
      action: "accept" | "dismiss";
      suggestionId: string;
    };

    if (!body.suggestionId || !["accept", "dismiss"].includes(body.action)) {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 400);
    }

    if (body.action === "accept") {
      const preferenceId = await acceptSuggestion(
        user.tenantId,
        user.practitionerId,
        body.suggestionId,
      );
      return NextResponse.json({ ok: true, action: "accepted", preferenceId });
    } else {
      await dismissSuggestion(user.tenantId, user.practitionerId, body.suggestionId);
      return NextResponse.json({ ok: true, action: "dismissed" });
    }
  } catch (err) {
    return apiError(ERROR_CODES.INTERNAL_ERROR, 500, err);
  }
}
