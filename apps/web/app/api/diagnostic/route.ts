import { NextResponse } from "next/server";

import { runIntegrationHealthCheck } from "@/lib/diagnostic/run-integration-health-check";

function diagnosticsEnabled(): boolean {
  if (process.env.DIAGNOSTIC_INTEGRATIONS_ENABLED === "true") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

/** Temporary GET probe for Bedrock + SMTP before manual UI walkthrough. */
export async function GET(): Promise<Response> {
  if (!diagnosticsEnabled()) {
    return NextResponse.json({ error: "NOT_AVAILABLE" }, { status: 404 });
  }

  const result = await runIntegrationHealthCheck();
  const allOk = result.bedrock === "Success" && result.smtp === "Success";

  return NextResponse.json(result, { status: allOk ? 200 : 503 });
}
