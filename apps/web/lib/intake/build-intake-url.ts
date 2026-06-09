import { env } from "@/lib/env";

export function buildIntakeAppBaseUrl(): string {
  return env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

export function buildPatientIntakeUrl(rawToken: string): string {
  return `${buildIntakeAppBaseUrl()}/intake/${encodeURIComponent(rawToken)}/step-one`;
}
