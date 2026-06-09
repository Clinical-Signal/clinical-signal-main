export type StepTwoSaveStatus = "idle" | "saving" | "saved" | "error";

export async function postStepTwoSection(
  token: string,
  answers: Record<string, unknown>,
): Promise<{ ok: true; savedAt: string } | { ok: false }> {
  const response = await fetch(`/api/intake/${encodeURIComponent(token)}/section`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section: "step_two", data: { answers } }),
  });

  if (!response.ok) {
    return { ok: false };
  }

  const payload = (await response.json()) as { savedAt?: string };
  return { ok: true, savedAt: payload.savedAt ?? new Date().toISOString() };
}
