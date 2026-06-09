import { customType } from "drizzle-orm/pg-core";

/** pgcrypto-encrypted PHI column (legacy `patients.name_encrypted`, etc.). */
export const bytea = customType<{ data: Buffer | null; driverData: string | null }>({
  dataType() {
    return "bytea";
  },
});

/** pgvector column — embedding dimension 1536 (PRD §4.4 / TR-6). */
export const vector1536 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    const trimmed = value.replace(/^\[/, "").replace(/\]$/, "");
    if (trimmed.length === 0) {
      return [];
    }
    return trimmed.split(",").map((part) => Number(part.trim()));
  },
});

/** PostgreSQL int4range — stored as driver string, typed as `[start, end)` pair. */
export const int4range = customType<{
  data: { start: number; end: number } | null;
  driverData: string | null;
}>({
  dataType() {
    return "int4range";
  },
  toDriver(value: { start: number; end: number } | null): string | null {
    if (value === null) {
      return null;
    }
    return `[${value.start},${value.end})`;
  },
  fromDriver(value: string | null): { start: number; end: number } | null {
    if (value === null) {
      return null;
    }
    const match = /\[(\d+),(\d+)\)/.exec(value);
    if (match === null) {
      return null;
    }
    return { start: Number(match[1]), end: Number(match[2]) };
  },
});
