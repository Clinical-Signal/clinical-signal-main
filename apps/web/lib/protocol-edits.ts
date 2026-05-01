// Protocol edit tracking — captures structured diffs between AI-generated
// and practitioner-approved protocols to learn practitioner patterns.

import { withTenant } from "./db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditType =
  | "supplement_added"
  | "supplement_removed"
  | "supplement_dosage_changed"
  | "supplement_timing_changed"
  | "supplement_replaced"
  | "dietary_added"
  | "dietary_removed"
  | "dietary_modified"
  | "lifestyle_added"
  | "lifestyle_removed"
  | "lifestyle_modified"
  | "layer_reordered"
  | "layer_added"
  | "layer_removed"
  | "language_rewritten"
  | "clinical_reasoning_edited"
  | "other";

export interface ProtocolEdit {
  editType: EditType;
  originalValue: Record<string, unknown> | null;
  editedValue: Record<string, unknown> | null;
  section: string;
  summary: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

/**
 * Compare the original AI-generated protocol with the practitioner-edited
 * version and produce a list of structured edits.
 */
export function computeProtocolDiff(
  original: { clinical: Record<string, unknown>; client: Record<string, unknown> },
  edited: { clinical: Record<string, unknown>; client: Record<string, unknown> },
): ProtocolEdit[] {
  const edits: ProtocolEdit[] = [];

  // Compare supplements
  edits.push(...diffSupplements(original.clinical, edited.clinical));

  // Compare dietary recommendations
  edits.push(...diffDietary(original.clinical, edited.clinical));

  // Compare lifestyle modifications
  edits.push(...diffLifestyle(original.clinical, edited.clinical));

  // Compare clinical reasoning
  edits.push(...diffClinicalReasoning(original.clinical, edited.clinical));

  // Compare client-facing language (layers)
  edits.push(...diffClientLayers(original.client, edited.client));

  return edits;
}

// --- Supplement diffing ---

interface SupplementEntry {
  name: string;
  dosage?: string;
  timing?: string;
  layer?: number;
  [key: string]: unknown;
}

function normalizeSupplementName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function diffSupplements(
  original: Record<string, unknown>,
  edited: Record<string, unknown>,
): ProtocolEdit[] {
  const edits: ProtocolEdit[] = [];

  const origSupps = (original.supplement_protocol ?? []) as SupplementEntry[];
  const editedSupps = (edited.supplement_protocol ?? []) as SupplementEntry[];

  const origMap = new Map<string, SupplementEntry>();
  for (const s of origSupps) {
    origMap.set(normalizeSupplementName(s.name), s);
  }

  const editedMap = new Map<string, SupplementEntry>();
  for (const s of editedSupps) {
    editedMap.set(normalizeSupplementName(s.name), s);
  }

  // Find removed supplements
  for (const [key, orig] of origMap) {
    if (!editedMap.has(key)) {
      edits.push({
        editType: "supplement_removed",
        originalValue: orig as Record<string, unknown>,
        editedValue: null,
        section: "supplement_protocol",
        summary: `Removed ${orig.name}${orig.layer ? ` from Layer ${orig.layer}` : ""}`,
        confidence: 1.0,
      });
    }
  }

  // Find added supplements
  for (const [key, edit] of editedMap) {
    if (!origMap.has(key)) {
      edits.push({
        editType: "supplement_added",
        originalValue: null,
        editedValue: edit as Record<string, unknown>,
        section: "supplement_protocol",
        summary: `Added ${edit.name}${edit.dosage ? ` ${edit.dosage}` : ""}${edit.layer ? ` to Layer ${edit.layer}` : ""}`,
        confidence: 1.0,
      });
    }
  }

  // Find modified supplements
  for (const [key, orig] of origMap) {
    const edit = editedMap.get(key);
    if (!edit) continue;

    // Dosage change
    if (orig.dosage && edit.dosage && orig.dosage !== edit.dosage) {
      edits.push({
        editType: "supplement_dosage_changed",
        originalValue: { name: orig.name, dosage: orig.dosage },
        editedValue: { name: edit.name, dosage: edit.dosage },
        section: "supplement_protocol",
        summary: `Changed ${orig.name} dosage from ${orig.dosage} to ${edit.dosage}`,
        confidence: 1.0,
      });
    }

    // Timing change
    if (orig.timing && edit.timing && orig.timing !== edit.timing) {
      edits.push({
        editType: "supplement_timing_changed",
        originalValue: { name: orig.name, timing: orig.timing },
        editedValue: { name: edit.name, timing: edit.timing },
        section: "supplement_protocol",
        summary: `Changed ${orig.name} timing from "${orig.timing}" to "${edit.timing}"`,
        confidence: 1.0,
      });
    }
  }

  return edits;
}

// --- Dietary diffing ---

interface DietaryEntry {
  recommendation: string;
  [key: string]: unknown;
}

function normalizeDietaryText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function diffDietary(
  original: Record<string, unknown>,
  edited: Record<string, unknown>,
): ProtocolEdit[] {
  const edits: ProtocolEdit[] = [];

  const origItems = (original.dietary_recommendations ?? []) as DietaryEntry[];
  const editedItems = (edited.dietary_recommendations ?? []) as DietaryEntry[];

  const origTexts = new Set(origItems.map((d) => normalizeDietaryText(d.recommendation)));
  const editedTexts = new Set(editedItems.map((d) => normalizeDietaryText(d.recommendation)));

  for (const item of origItems) {
    if (!editedTexts.has(normalizeDietaryText(item.recommendation))) {
      edits.push({
        editType: "dietary_removed",
        originalValue: item as Record<string, unknown>,
        editedValue: null,
        section: "dietary_recommendations",
        summary: `Removed dietary recommendation: "${item.recommendation.slice(0, 80)}"`,
        confidence: 0.9,
      });
    }
  }

  for (const item of editedItems) {
    if (!origTexts.has(normalizeDietaryText(item.recommendation))) {
      edits.push({
        editType: "dietary_added",
        originalValue: null,
        editedValue: item as Record<string, unknown>,
        section: "dietary_recommendations",
        summary: `Added dietary recommendation: "${item.recommendation.slice(0, 80)}"`,
        confidence: 0.9,
      });
    }
  }

  return edits;
}

// --- Lifestyle diffing ---

interface LifestyleEntry {
  modification: string;
  [key: string]: unknown;
}

function diffLifestyle(
  original: Record<string, unknown>,
  edited: Record<string, unknown>,
): ProtocolEdit[] {
  const edits: ProtocolEdit[] = [];

  const origItems = (original.lifestyle_modifications ?? []) as LifestyleEntry[];
  const editedItems = (edited.lifestyle_modifications ?? []) as LifestyleEntry[];

  const origTexts = new Set(origItems.map((l) => l.modification.toLowerCase().trim()));
  const editedTexts = new Set(editedItems.map((l) => l.modification.toLowerCase().trim()));

  for (const item of origItems) {
    if (!editedTexts.has(item.modification.toLowerCase().trim())) {
      edits.push({
        editType: "lifestyle_removed",
        originalValue: item as Record<string, unknown>,
        editedValue: null,
        section: "lifestyle_modifications",
        summary: `Removed lifestyle modification: "${item.modification.slice(0, 80)}"`,
        confidence: 0.9,
      });
    }
  }

  for (const item of editedItems) {
    if (!origTexts.has(item.modification.toLowerCase().trim())) {
      edits.push({
        editType: "lifestyle_added",
        originalValue: null,
        editedValue: item as Record<string, unknown>,
        section: "lifestyle_modifications",
        summary: `Added lifestyle modification: "${item.modification.slice(0, 80)}"`,
        confidence: 0.9,
      });
    }
  }

  return edits;
}

// --- Clinical reasoning diffing ---

function diffClinicalReasoning(
  original: Record<string, unknown>,
  edited: Record<string, unknown>,
): ProtocolEdit[] {
  const origReasoning = String(original.clinical_reasoning ?? "");
  const editedReasoning = String(edited.clinical_reasoning ?? "");

  if (!origReasoning || !editedReasoning) return [];

  // Simple check: if the text changed meaningfully (>10% different)
  const origWords = origReasoning.split(/\s+/);
  const editedWords = editedReasoning.split(/\s+/);
  const origSet = new Set(origWords);
  const editedSet = new Set(editedWords);

  let shared = 0;
  for (const w of editedSet) {
    if (origSet.has(w)) shared++;
  }
  const similarity = shared / Math.max(origSet.size, editedSet.size);

  if (similarity < 0.9) {
    return [{
      editType: "clinical_reasoning_edited",
      originalValue: { text: origReasoning.slice(0, 500) },
      editedValue: { text: editedReasoning.slice(0, 500) },
      section: "clinical_reasoning",
      summary: "Practitioner edited clinical reasoning narrative",
      confidence: 0.8,
    }];
  }

  return [];
}

// --- Client layer diffing ---

interface LayerEntry {
  layer: number;
  title?: string;
  [key: string]: unknown;
}

function diffClientLayers(
  original: Record<string, unknown>,
  edited: Record<string, unknown>,
): ProtocolEdit[] {
  const edits: ProtocolEdit[] = [];

  const origLayers = (original.layers ?? []) as LayerEntry[];
  const editedLayers = (edited.layers ?? []) as LayerEntry[];

  if (origLayers.length !== editedLayers.length) {
    if (editedLayers.length > origLayers.length) {
      edits.push({
        editType: "layer_added",
        originalValue: { count: origLayers.length },
        editedValue: { count: editedLayers.length },
        section: "client_action_plan.layers",
        summary: `Added ${editedLayers.length - origLayers.length} layer(s) (${origLayers.length} → ${editedLayers.length})`,
        confidence: 1.0,
      });
    } else {
      edits.push({
        editType: "layer_removed",
        originalValue: { count: origLayers.length },
        editedValue: { count: editedLayers.length },
        section: "client_action_plan.layers",
        summary: `Removed ${origLayers.length - editedLayers.length} layer(s) (${origLayers.length} → ${editedLayers.length})`,
        confidence: 1.0,
      });
    }
  }

  // Check for significant language rewrites in matching layers
  const minLayers = Math.min(origLayers.length, editedLayers.length);
  for (let i = 0; i < minLayers; i++) {
    const origTitle = String(origLayers[i]?.title ?? "");
    const editedTitle = String(editedLayers[i]?.title ?? "");
    if (origTitle && editedTitle && origTitle !== editedTitle) {
      edits.push({
        editType: "language_rewritten",
        originalValue: { layer: i + 1, title: origTitle },
        editedValue: { layer: i + 1, title: editedTitle },
        section: `client_action_plan.layers[${i}].title`,
        summary: `Renamed Layer ${i + 1} from "${origTitle}" to "${editedTitle}"`,
        confidence: 1.0,
      });
    }
  }

  return edits;
}

// ---------------------------------------------------------------------------
// DB writes
// ---------------------------------------------------------------------------

/**
 * Store protocol edits in the database. Called when a protocol is approved
 * after being edited by the practitioner.
 */
export async function storeProtocolEdits(args: {
  tenantId: string;
  protocolId: string;
  patientId: string;
  practitionerId: string;
  edits: ProtocolEdit[];
  originalClinical: Record<string, unknown>;
  originalClient: Record<string, unknown>;
}): Promise<void> {
  if (args.edits.length === 0) return;

  await withTenant(args.tenantId, async (c) => {
    // Store original snapshots only on the first edit row
    for (let i = 0; i < args.edits.length; i++) {
      const edit = args.edits[i]!;
      await c.query(
        `INSERT INTO protocol_edits
           (tenant_id, protocol_id, patient_id, practitioner_id,
            edit_type, original_value, edited_value, section, summary,
            original_clinical, original_client, confidence)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9,
                 $10::jsonb, $11::jsonb, $12)`,
        [
          args.tenantId,
          args.protocolId,
          args.patientId,
          args.practitionerId,
          edit.editType,
          edit.originalValue ? JSON.stringify(edit.originalValue) : null,
          edit.editedValue ? JSON.stringify(edit.editedValue) : null,
          edit.section,
          edit.summary,
          i === 0 ? JSON.stringify(args.originalClinical) : null,
          i === 0 ? JSON.stringify(args.originalClient) : null,
          edit.confidence,
        ],
      );
    }
  });

  console.log(
    `[protocol-edits] Stored ${args.edits.length} edit(s) for protocol ${args.protocolId}`,
  );
}

// ---------------------------------------------------------------------------
// Read edit history for pattern detection
// ---------------------------------------------------------------------------

export interface StoredEdit {
  id: string;
  protocolId: string;
  editType: EditType;
  originalValue: Record<string, unknown> | null;
  editedValue: Record<string, unknown> | null;
  section: string;
  summary: string;
  confidence: number;
  createdAt: Date;
}

/**
 * Get recent edits for a practitioner, optionally filtered by edit type.
 * Used by the pattern recognition system.
 */
export async function getPractitionerEdits(
  tenantId: string,
  practitionerId: string,
  options?: { editType?: EditType; limit?: number },
): Promise<StoredEdit[]> {
  const limit = options?.limit ?? 100;

  return withTenant(tenantId, async (c) => {
    let query = `
      SELECT id, protocol_id, edit_type, original_value, edited_value,
             section, summary, confidence, created_at
        FROM protocol_edits
       WHERE practitioner_id = $1`;
    const params: unknown[] = [practitionerId];

    if (options?.editType) {
      params.push(options.editType);
      query += ` AND edit_type = $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const { rows } = await c.query<{
      id: string;
      protocol_id: string;
      edit_type: EditType;
      original_value: Record<string, unknown> | null;
      edited_value: Record<string, unknown> | null;
      section: string;
      summary: string;
      confidence: number;
      created_at: Date;
    }>(query, params);

    return rows.map((r) => ({
      id: r.id,
      protocolId: r.protocol_id,
      editType: r.edit_type,
      originalValue: r.original_value,
      editedValue: r.edited_value,
      section: r.section,
      summary: r.summary,
      confidence: r.confidence,
      createdAt: r.created_at,
    }));
  });
}

/**
 * Count edits by type for a practitioner. Used to determine when
 * enough data exists to suggest a preference.
 */
export async function getEditPatternCounts(
  tenantId: string,
  practitionerId: string,
): Promise<Array<{ editType: EditType; count: number; latestSummary: string }>> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      edit_type: EditType;
      count: string;
      latest_summary: string;
    }>(
      `SELECT edit_type,
              COUNT(*)::text AS count,
              (ARRAY_AGG(summary ORDER BY created_at DESC))[1] AS latest_summary
         FROM protocol_edits
        WHERE practitioner_id = $1
        GROUP BY edit_type
        ORDER BY COUNT(*) DESC`,
      [practitionerId],
    );

    return rows.map((r) => ({
      editType: r.edit_type,
      count: parseInt(r.count, 10),
      latestSummary: r.latest_summary,
    }));
  });
}
