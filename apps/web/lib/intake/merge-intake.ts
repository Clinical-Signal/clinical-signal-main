import type { AiConfirmationSlot, IntakeData, ProvenanceSource } from "./schemas/intake-data.schema";

const METADATA_KEYS = new Set(["_provenance", "_ai_confirmations"]);

export type IntakeDataMergeInput = {
  about_you?: IntakeData["about_you"];
  why_here?: IntakeData["why_here"];
  symptoms?: IntakeData["symptoms"];
  history?: IntakeData["history"];
  medications?: IntakeData["medications"];
  lifestyle?: IntakeData["lifestyle"];
  hormones?: IntakeData["hormones"];
  previous_labs?: IntakeData["previous_labs"];
  wearables?: IntakeData["wearables"];
  anything_else?: IntakeData["anything_else"];
  step_two?: IntakeData["step_two"];
  _analysis_degraded?: boolean;
};

function cloneIntakeData(existing: IntakeData): IntakeData {
  return structuredClone(existing);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setAtPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path.split(".");
  let cursor: Record<string, unknown> = target;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!segment) {
      continue;
    }

    const next = cursor[segment];
    if (!isPlainObject(next)) {
      cursor[segment] = {};
    }

    cursor = cursor[segment] as Record<string, unknown>;
  }

  const leaf = segments.at(-1);
  if (leaf) {
    cursor[leaf] = value;
  }
}

function getAtPath(target: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".");
  let cursor: unknown = target;

  for (const segment of segments) {
    if (!isPlainObject(cursor)) {
      return undefined;
    }

    cursor = cursor[segment];
  }

  return cursor;
}

function mergeLeaf(
  data: Record<string, unknown>,
  provenance: Record<string, ProvenanceSource>,
  aiConfirmations: Record<string, AiConfirmationSlot>,
  path: string,
  incomingValue: unknown,
  source: ProvenanceSource,
): void {
  const existingProvenance = provenance[path];

  if (source === "ai") {
    if (existingProvenance === "patient") {
      aiConfirmations[path] = {
        value: incomingValue,
        confirmed: false,
      };
      return;
    }

    setAtPath(data, path, incomingValue);
    provenance[path] = "ai";
    aiConfirmations[path] = {
      value: incomingValue,
      confirmed: false,
    };
    return;
  }

  setAtPath(data, path, incomingValue);
  provenance[path] = source;

  if (source === "clinician") {
    aiConfirmations[path] = {
      value: incomingValue,
      confirmed: true,
    };
    return;
  }

  delete aiConfirmations[path];
}

function mergeRecursive(
  data: Record<string, unknown>,
  provenance: Record<string, ProvenanceSource>,
  aiConfirmations: Record<string, AiConfirmationSlot>,
  basePath: string,
  existingValue: unknown,
  incomingValue: unknown,
  source: ProvenanceSource,
): void {
  if (
    isPlainObject(existingValue) &&
    isPlainObject(incomingValue) &&
    !Array.isArray(existingValue) &&
    !Array.isArray(incomingValue)
  ) {
    for (const [key, value] of Object.entries(incomingValue)) {
      const path = basePath ? `${basePath}.${key}` : key;
      mergeRecursive(
        data,
        provenance,
        aiConfirmations,
        path,
        getAtPath(data, path),
        value,
        source,
      );
    }
    return;
  }

  mergeLeaf(data, provenance, aiConfirmations, basePath, incomingValue, source);
}

/**
 * Shallow JSONB merge with provenance tagging.
 * AI values never overwrite patient-authored fields; they land in `_ai_confirmations`.
 */
export function mergeIntakeData(
  existing: IntakeData,
  incoming: IntakeDataMergeInput,
  source: ProvenanceSource,
): IntakeData {
  const merged = cloneIntakeData(existing);

  for (const [key, value] of Object.entries(incoming)) {
    if (METADATA_KEYS.has(key) || value === undefined) {
      continue;
    }

    if (key === "_analysis_degraded" && typeof value === "boolean") {
      merged._analysis_degraded = value;
      continue;
    }

    mergeRecursive(
      merged as unknown as Record<string, unknown>,
      merged._provenance,
      merged._ai_confirmations,
      key,
      getAtPath(merged as unknown as Record<string, unknown>, key),
      value,
      source,
    );
  }

  return merged;
}
