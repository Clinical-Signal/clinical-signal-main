"use server";

import { requireAuth } from "@/lib/auth";
import {
  addPreference,
  updatePreference,
  deletePreference,
  type PreferenceCategory,
} from "@/lib/preferences";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export async function addPreferenceAction(
  category: PreferenceCategory,
  ruleText: string,
  label?: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  if (!ruleText.trim()) return { ok: false, error: "Rule text is required." };
  try {
    const id = await addPreference(user.tenantId, user.practitionerId, category, ruleText.trim(), label?.trim());
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updatePreferenceAction(
  prefId: string,
  updates: { ruleText?: string; label?: string; category?: PreferenceCategory; active?: boolean },
): Promise<ActionResult> {
  const user = await requireAuth();
  try {
    await updatePreference(user.tenantId, prefId, updates);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deletePreferenceAction(
  prefId: string,
): Promise<ActionResult> {
  const user = await requireAuth();
  try {
    await deletePreference(user.tenantId, prefId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
