import type { ReactNode } from "react";

import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

import { IntakeLinkExpired } from "./intake-link-expired";

type LayoutProps = {
  children: ReactNode;
  params: { token: string };
};

export default async function IntakeTokenLayout({ children, params }: LayoutProps) {
  const rawToken = params.token?.trim();
  if (!rawToken) {
    return <IntakeLinkExpired />;
  }

  const gate = await getIntakeTokenService().inspectGate(rawToken);
  if (!gate.allowed) {
    return <IntakeLinkExpired />;
  }

  return children;
}
