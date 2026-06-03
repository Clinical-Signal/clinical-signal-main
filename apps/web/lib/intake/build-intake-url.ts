export function buildIntakeAppBaseUrl(): string {
  return (
    process.env.DEMO_APP_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function buildPatientIntakeUrl(rawToken: string): string {
  return `${buildIntakeAppBaseUrl()}/intake/${encodeURIComponent(rawToken)}/step-one`;
}
