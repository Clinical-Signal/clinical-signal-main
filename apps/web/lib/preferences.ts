// Practitioner preferences — free-text rules that shape AI protocol output.
// Each practitioner maintains their own "playbook" of rules the AI follows.

import { withTenant } from "./db";

export type PreferenceCategory =
  | "protocol_structure"
  | "supplements"
  | "communication_style"
  | "branding"
  | "clinical"
  | "general";

export const CATEGORY_LABELS: Record<PreferenceCategory, string> = {
  protocol_structure: "Protocol structure",
  supplements: "Supplements",
  communication_style: "Communication style",
  branding: "Branding",
  clinical: "Clinical rules",
  general: "General",
};

export const CATEGORY_DESCRIPTIONS: Record<PreferenceCategory, string> = {
  protocol_structure: "Phasing, block length, sequencing (e.g. \"4-week blocks, Week 1 is prep\")",
  supplements: "Brand preferences, max counts, exclusions (e.g. \"no more than 5 supplements per phase\")",
  communication_style: "Tone, formality, phrases (e.g. \"warm but professional, avoid clinical jargon\")",
  branding: "Practice name, sign-off, contact info for documents and emails",
  clinical: "Clinical decision rules (e.g. \"always address gut before hormones\")",
  general: "Anything else that should guide the AI output",
};

export interface Preference {
  id: string;
  practitionerId: string;
  category: PreferenceCategory;
  ruleText: string;
  label: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getPreferences(
  tenantId: string,
  practitionerId: string,
): Promise<Preference[]> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      practitioner_id: string;
      category: PreferenceCategory;
      rule_text: string;
      label: string | null;
      active: boolean;
      sort_order: number;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, practitioner_id, category, rule_text, label, active, sort_order, created_at, updated_at
         FROM practitioner_preferences
        WHERE practitioner_id = $1
        ORDER BY sort_order, created_at`,
      [practitionerId],
    );
    return rows.map((r) => ({
      id: r.id,
      practitionerId: r.practitioner_id,
      category: r.category,
      ruleText: r.rule_text,
      label: r.label,
      active: r.active,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  });
}

/** Get only active preferences, formatted for prompt injection. */
export async function getActivePreferencesForPrompt(
  tenantId: string,
  practitionerId: string,
): Promise<string> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      category: PreferenceCategory;
      rule_text: string;
    }>(
      `SELECT category, rule_text
         FROM practitioner_preferences
        WHERE practitioner_id = $1 AND active = true
        ORDER BY category, sort_order`,
      [practitionerId],
    );

    if (rows.length === 0) return "";

    const grouped: Record<string, string[]> = {};
    for (const r of rows) {
      const cat = CATEGORY_LABELS[r.category] ?? r.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(r.rule_text);
    }

    const lines: string[] = [
      "## Practitioner preferences",
      "",
      "The practitioner who will review this output has specified the following",
      "style, structure, and formatting preferences. Follow these when generating",
      "the protocol and all derivative outputs.",
      "",
      "IMPORTANT: These preferences customize presentation and structure. They",
      "are ADDITIVE to — and never override — clinical safety guardrails,",
      "evidence-based reasoning, drug-supplement interaction checks, dose",
      "ceiling limits, or contraindication screening. If a preference conflicts",
      "with clinical safety, prioritize safety and note the conflict.",
      "",
    ];

    for (const [cat, rules] of Object.entries(grouped)) {
      lines.push(`### ${cat}`);
      for (const rule of rules) {
        lines.push(`- ${rule}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  });
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function addPreference(
  tenantId: string,
  practitionerId: string,
  category: PreferenceCategory,
  ruleText: string,
  label?: string,
): Promise<string> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO practitioner_preferences (tenant_id, practitioner_id, category, rule_text, label)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [tenantId, practitionerId, category, ruleText, label ?? null],
    );
    return rows[0]!.id;
  });
}

export async function updatePreference(
  tenantId: string,
  prefId: string,
  updates: { ruleText?: string; label?: string; category?: PreferenceCategory; active?: boolean },
): Promise<void> {
  const sets: string[] = ["updated_at = now()"];
  const vals: unknown[] = [];
  let i = 1;

  if (updates.ruleText !== undefined) { sets.push(`rule_text = $${i++}`); vals.push(updates.ruleText); }
  if (updates.label !== undefined) { sets.push(`label = $${i++}`); vals.push(updates.label); }
  if (updates.category !== undefined) { sets.push(`category = $${i++}`); vals.push(updates.category); }
  if (updates.active !== undefined) { sets.push(`active = $${i++}`); vals.push(updates.active); }

  vals.push(prefId);

  await withTenant(tenantId, async (c) => {
    await c.query(
      `UPDATE practitioner_preferences SET ${sets.join(", ")} WHERE id = $${i}`,
      vals,
    );
  });
}

export async function deletePreference(
  tenantId: string,
  prefId: string,
): Promise<void> {
  await withTenant(tenantId, async (c) => {
    await c.query("DELETE FROM practitioner_preferences WHERE id = $1", [prefId]);
  });
}
