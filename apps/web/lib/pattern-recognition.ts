/**
 * Edit pattern recognition — the data flywheel / moat.
 *
 * Analyzes a practitioner's protocol edit history to detect recurring
 * patterns and surfaces them as suggested preferences. Patterns like
 * "always removes ashwagandha" or "always increases magnesium dose"
 * become preference suggestions the practitioner can accept with one click.
 *
 * Architecture:
 *   1. Pull recent edits from protocol_edits table
 *   2. Group by edit_type + normalized key (supplement name, etc.)
 *   3. Count occurrences — threshold of 3+ for suggestions
 *   4. Use AI to synthesize patterns into natural-language preference rules
 *   5. Store as suggested_preferences for the practitioner to review
 */

import { withTenant } from "./db";
import type { EditType, StoredEdit } from "./protocol-edits";
import { getPractitionerEdits, getEditPatternCounts } from "./protocol-edits";
import type { PreferenceCategory } from "./preferences";

const PATTERN_MODEL = "claude-sonnet-4-5-20250929";

// Minimum number of times an edit pattern must occur before we suggest it
const MIN_PATTERN_COUNT = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectedPattern {
  editType: EditType;
  key: string;          // normalized identifier (supplement name, dietary text, etc.)
  count: number;        // how many times this pattern appeared
  examples: string[];   // human-readable summaries of the edits
  editIds: string[];    // protocol_edit IDs that support this pattern
}

export interface SuggestedPreference {
  category: PreferenceCategory;
  suggestedRule: string;
  label: string;
  reasoning: string;
  supportingEditIds: string[];
  confidence: number;
}

// ---------------------------------------------------------------------------
// Pattern detection (deterministic, no AI)
// ---------------------------------------------------------------------------

/**
 * Analyze a practitioner's edit history and detect recurring patterns.
 * This is the deterministic first pass — groups edits by type and key.
 */
export async function detectPatterns(
  tenantId: string,
  practitionerId: string,
): Promise<DetectedPattern[]> {
  // Pull all recent edits
  const edits = await getPractitionerEdits(tenantId, practitionerId, { limit: 200 });
  if (edits.length < MIN_PATTERN_COUNT) return [];

  const patterns: DetectedPattern[] = [];

  // Group supplement edits by normalized supplement name
  const supplementPatterns = groupSupplementEdits(edits);
  patterns.push(...supplementPatterns);

  // Group dietary edits by action (add/remove + normalized text)
  const dietaryPatterns = groupDietaryEdits(edits);
  patterns.push(...dietaryPatterns);

  // Group lifestyle edits
  const lifestylePatterns = groupLifestyleEdits(edits);
  patterns.push(...lifestylePatterns);

  // Detect layer count changes
  const layerPatterns = detectLayerPatterns(edits);
  patterns.push(...layerPatterns);

  // Filter to patterns meeting threshold
  return patterns.filter((p) => p.count >= MIN_PATTERN_COUNT);
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function groupSupplementEdits(edits: StoredEdit[]): DetectedPattern[] {
  const groups = new Map<string, { type: EditType; count: number; examples: string[]; ids: string[] }>();

  for (const edit of edits) {
    if (!edit.editType.startsWith("supplement_")) continue;

    // Extract supplement name from either original or edited value
    let suppName = "";
    if (edit.editedValue && "name" in edit.editedValue) {
      suppName = String(edit.editedValue.name);
    } else if (edit.originalValue && "name" in edit.originalValue) {
      suppName = String(edit.originalValue.name);
    }
    if (!suppName) continue;

    const key = `${edit.editType}:${normalizeKey(suppName)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      if (existing.examples.length < 5) existing.examples.push(edit.summary);
      existing.ids.push(edit.id);
    } else {
      groups.set(key, {
        type: edit.editType,
        count: 1,
        examples: [edit.summary],
        ids: [edit.id],
      });
    }
  }

  return Array.from(groups.entries()).map(([key, g]) => ({
    editType: g.type,
    key,
    count: g.count,
    examples: g.examples,
    editIds: g.ids,
  }));
}

function groupDietaryEdits(edits: StoredEdit[]): DetectedPattern[] {
  const groups = new Map<string, { type: EditType; count: number; examples: string[]; ids: string[] }>();

  for (const edit of edits) {
    if (!edit.editType.startsWith("dietary_")) continue;

    // Use first 40 chars of the recommendation as grouping key
    let text = "";
    if (edit.editedValue && "recommendation" in edit.editedValue) {
      text = String(edit.editedValue.recommendation);
    } else if (edit.originalValue && "recommendation" in edit.originalValue) {
      text = String(edit.originalValue.recommendation);
    }
    if (!text) continue;

    // Group by significant words to catch slight variations
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 5).sort();
    const key = `${edit.editType}:${words.join("_")}`;

    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      if (existing.examples.length < 5) existing.examples.push(edit.summary);
      existing.ids.push(edit.id);
    } else {
      groups.set(key, {
        type: edit.editType,
        count: 1,
        examples: [edit.summary],
        ids: [edit.id],
      });
    }
  }

  return Array.from(groups.entries()).map(([key, g]) => ({
    editType: g.type,
    key,
    count: g.count,
    examples: g.examples,
    editIds: g.ids,
  }));
}

function groupLifestyleEdits(edits: StoredEdit[]): DetectedPattern[] {
  const groups = new Map<string, { type: EditType; count: number; examples: string[]; ids: string[] }>();

  for (const edit of edits) {
    if (!edit.editType.startsWith("lifestyle_")) continue;

    let text = "";
    if (edit.editedValue && "modification" in edit.editedValue) {
      text = String(edit.editedValue.modification);
    } else if (edit.originalValue && "modification" in edit.originalValue) {
      text = String(edit.originalValue.modification);
    }
    if (!text) continue;

    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 5).sort();
    const key = `${edit.editType}:${words.join("_")}`;

    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      if (existing.examples.length < 5) existing.examples.push(edit.summary);
      existing.ids.push(edit.id);
    } else {
      groups.set(key, {
        type: edit.editType,
        count: 1,
        examples: [edit.summary],
        ids: [edit.id],
      });
    }
  }

  return Array.from(groups.entries()).map(([key, g]) => ({
    editType: g.type,
    key,
    count: g.count,
    examples: g.examples,
    editIds: g.ids,
  }));
}

function detectLayerPatterns(edits: StoredEdit[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Count how often practitioner adds or removes layers
  const layerAdds = edits.filter((e) => e.editType === "layer_added");
  const layerRemoves = edits.filter((e) => e.editType === "layer_removed");

  if (layerAdds.length >= MIN_PATTERN_COUNT) {
    patterns.push({
      editType: "layer_added",
      key: "layer_added:general",
      count: layerAdds.length,
      examples: layerAdds.slice(0, 5).map((e) => e.summary),
      editIds: layerAdds.map((e) => e.id),
    });
  }

  if (layerRemoves.length >= MIN_PATTERN_COUNT) {
    patterns.push({
      editType: "layer_removed",
      key: "layer_removed:general",
      count: layerRemoves.length,
      examples: layerRemoves.slice(0, 5).map((e) => e.summary),
      editIds: layerRemoves.map((e) => e.id),
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Pattern → Suggested Preference (AI synthesis)
// ---------------------------------------------------------------------------

const PATTERN_SYNTHESIS_PROMPT = `You are a clinical protocol assistant. You've detected recurring patterns in how a functional medicine practitioner edits their AI-generated protocols. Your job is to convert these patterns into clear, actionable preference rules the practitioner can review and accept.

For each pattern, write:
1. A clear preference rule in the practitioner's voice (as if they're telling the AI what to do)
2. A short label (3-6 words)
3. A reasoning statement explaining why the system thinks this is a pattern

## Output contract

Return ONLY valid JSON with this shape:

{
  "suggestions": [
    {
      "category": "supplements | clinical | protocol_structure | communication_style | general",
      "suggested_rule": "string — the preference rule, written as an instruction to the AI (e.g. 'Never include ashwagandha in protocols' or 'Always use magnesium glycinate 400mg rather than 300mg')",
      "label": "string — short label, e.g. 'No ashwagandha' or 'Higher magnesium dose'",
      "reasoning": "string — why the system thinks this, with specifics (e.g. 'You removed ashwagandha from 4 of your last 6 protocols')",
      "confidence": "number 0-1 — how confident this pattern is (higher count + consistency = higher confidence)"
    }
  ]
}

## Rules
- Only suggest rules that the practitioner clearly and consistently applies.
- Do not suggest rules from a single edit — patterns must be repeated.
- Use warm, professional language. These are preferences, not criticisms.
- Keep rules concise and specific — "Never include X" is better than a paragraph.
- If a pattern seems contradictory (e.g., sometimes adds, sometimes removes the same supplement), do NOT suggest it — it may be context-dependent.
- Map each suggestion to the most appropriate category.`;

/**
 * Use AI to synthesize detected patterns into natural-language preference
 * suggestions the practitioner can accept with one click.
 */
export async function synthesizePatterns(
  patterns: DetectedPattern[],
): Promise<SuggestedPreference[]> {
  if (patterns.length === 0) return [];

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const claude = new Anthropic({ apiKey: key, timeout: 60_000 });

  const userContent =
    "Analyze these recurring edit patterns and suggest preference rules. Respond with JSON only.\n\n" +
    "<patterns>\n" +
    JSON.stringify(
      patterns.map((p) => ({
        edit_type: p.editType,
        count: p.count,
        examples: p.examples,
      })),
      null,
      2,
    ) +
    "\n</patterns>";

  console.log("[pattern-recognition] Synthesizing", patterns.length, "patterns");
  const response = await claude.messages.create({
    model: PATTERN_MODEL,
    max_tokens: 2000,
    system: PATTERN_SYNTHESIS_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  let raw = "";
  for (const block of response.content) {
    if (block.type === "text") raw += block.text;
  }

  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\n/, "");
    cleaned = cleaned.replace(/\n```\s*$/, "");
  }

  const parsed = JSON.parse(cleaned) as {
    suggestions: Array<{
      category: PreferenceCategory;
      suggested_rule: string;
      label: string;
      reasoning: string;
      confidence: number;
    }>;
  };

  // Map AI suggestions back to the supporting edit IDs
  return parsed.suggestions.map((s, i) => ({
    category: s.category,
    suggestedRule: s.suggested_rule,
    label: s.label,
    reasoning: s.reasoning,
    // Best effort: assign the pattern's edit IDs to matching suggestions
    supportingEditIds: patterns[i]?.editIds ?? [],
    confidence: s.confidence,
  }));
}

// ---------------------------------------------------------------------------
// Storage: persist suggestions to suggested_preferences table
// ---------------------------------------------------------------------------

/**
 * Store suggested preferences in the database. Skips suggestions that
 * duplicate existing active or pending suggestions.
 */
export async function storeSuggestedPreferences(
  tenantId: string,
  practitionerId: string,
  suggestions: SuggestedPreference[],
): Promise<number> {
  if (suggestions.length === 0) return 0;

  return withTenant(tenantId, async (c) => {
    // Check for existing pending/active suggestions to avoid duplicates
    const { rows: existing } = await c.query<{ suggested_rule: string }>(
      `SELECT suggested_rule FROM suggested_preferences
       WHERE practitioner_id = $1 AND status IN ('pending', 'accepted', 'auto_applied')`,
      [practitionerId],
    );
    const existingRules = new Set(existing.map((r) => r.suggested_rule.toLowerCase().trim()));

    let stored = 0;
    for (const s of suggestions) {
      // Skip if a similar rule already exists
      if (existingRules.has(s.suggestedRule.toLowerCase().trim())) continue;

      await c.query(
        `INSERT INTO suggested_preferences
           (tenant_id, practitioner_id, category, suggested_rule, label,
            reasoning, supporting_edits, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
        [
          tenantId,
          practitionerId,
          s.category,
          s.suggestedRule,
          s.label,
          s.reasoning,
          s.supportingEditIds,
        ],
      );
      stored++;
    }

    console.log(`[pattern-recognition] Stored ${stored} new suggestion(s) for practitioner`);
    return stored;
  });
}

// ---------------------------------------------------------------------------
// Full pipeline: detect → synthesize → store
// ---------------------------------------------------------------------------

/**
 * Run the full pattern recognition pipeline for a practitioner.
 * Called after a protocol is approved (in the background).
 */
export async function runPatternRecognition(
  tenantId: string,
  practitionerId: string,
): Promise<{ patternsFound: number; suggestionsStored: number }> {
  console.log("[pattern-recognition] Starting for practitioner", practitionerId);
  const t0 = Date.now();

  // Step 1: Detect patterns from edit history
  const patterns = await detectPatterns(tenantId, practitionerId);
  console.log("[pattern-recognition] Detected", patterns.length, "patterns");

  if (patterns.length === 0) {
    return { patternsFound: 0, suggestionsStored: 0 };
  }

  // Step 2: Use AI to synthesize into preference suggestions
  const suggestions = await synthesizePatterns(patterns);
  console.log("[pattern-recognition] AI synthesized", suggestions.length, "suggestions");

  // Step 3: Store in database
  const stored = await storeSuggestedPreferences(tenantId, practitionerId, suggestions);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("[pattern-recognition] Complete in", elapsed + "s");

  return { patternsFound: patterns.length, suggestionsStored: stored };
}

// ---------------------------------------------------------------------------
// Read suggestions for the UI
// ---------------------------------------------------------------------------

export interface StoredSuggestion {
  id: string;
  category: PreferenceCategory;
  suggestedRule: string;
  label: string | null;
  reasoning: string;
  status: string;
  createdAt: Date;
}

/**
 * Get pending suggestions for a practitioner to review.
 */
export async function getPendingSuggestions(
  tenantId: string,
  practitionerId: string,
): Promise<StoredSuggestion[]> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      category: PreferenceCategory;
      suggested_rule: string;
      label: string | null;
      reasoning: string;
      status: string;
      created_at: Date;
    }>(
      `SELECT id, category, suggested_rule, label, reasoning, status, created_at
         FROM suggested_preferences
        WHERE practitioner_id = $1 AND status = 'pending'
        ORDER BY created_at DESC`,
      [practitionerId],
    );
    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      suggestedRule: r.suggested_rule,
      label: r.label,
      reasoning: r.reasoning,
      status: r.status,
      createdAt: r.created_at,
    }));
  });
}

/**
 * Accept a suggestion — creates a real preference and marks suggestion as accepted.
 */
export async function acceptSuggestion(
  tenantId: string,
  practitionerId: string,
  suggestionId: string,
): Promise<string> {
  return withTenant(tenantId, async (c) => {
    // Get the suggestion
    const { rows } = await c.query<{
      category: PreferenceCategory;
      suggested_rule: string;
      label: string | null;
    }>(
      `SELECT category, suggested_rule, label FROM suggested_preferences
       WHERE id = $1 AND practitioner_id = $2 AND status = 'pending'`,
      [suggestionId, practitionerId],
    );

    if (rows.length === 0) throw new Error("Suggestion not found or already resolved");
    const s = rows[0]!;

    // Create the actual preference
    const { rows: prefRows } = await c.query<{ id: string }>(
      `INSERT INTO practitioner_preferences
         (tenant_id, practitioner_id, category, rule_text, label)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [tenantId, practitionerId, s.category, s.suggested_rule, s.label],
    );
    const preferenceId = prefRows[0]!.id;

    // Mark suggestion as accepted
    await c.query(
      `UPDATE suggested_preferences
         SET status = 'accepted', preference_id = $1, resolved_at = now()
       WHERE id = $2`,
      [preferenceId, suggestionId],
    );

    console.log("[pattern-recognition] Suggestion", suggestionId, "accepted → preference", preferenceId);
    return preferenceId;
  });
}

/**
 * Dismiss a suggestion — practitioner decided not to adopt it.
 */
export async function dismissSuggestion(
  tenantId: string,
  practitionerId: string,
  suggestionId: string,
): Promise<void> {
  await withTenant(tenantId, async (c) => {
    await c.query(
      `UPDATE suggested_preferences
         SET status = 'dismissed', resolved_at = now()
       WHERE id = $1 AND practitioner_id = $2 AND status = 'pending'`,
      [suggestionId, practitionerId],
    );
  });
}
