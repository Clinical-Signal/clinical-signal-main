/**
 * Unit tests for apps/web/scripts/migrate.mjs.
 *
 * Run with: npx vitest run lib/__tests__/migrate.test.ts
 *
 * Scope:
 *   - Pure logic only: filename parsing, sorting, duplicate detection,
 *     SHA-256 stability. Database integration is exercised by the smoke
 *     test (`docker compose up`) rather than here, to keep this suite
 *     fast and not require a Postgres instance.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The runner is plain ESM (.mjs). Vitest resolves it natively. We import
// only the pure-logic exports here; runMigrations() is not called.
// @ts-expect-error - .mjs has no TS declaration file; pure-JS interop.
import { parseMigrationFilename, discoverMigrations, sha256 } from "../../scripts/migrate.mjs";

describe("parseMigrationFilename", () => {
  it("accepts canonical 4-digit version + snake_case name + .sql", () => {
    expect(parseMigrationFilename("0001_auth.sql")).toEqual({
      version: "0001",
      name: "auth",
      filename: "0001_auth.sql",
    });
  });

  it("accepts multi-word names", () => {
    expect(parseMigrationFilename("0022_practice_first_class.sql")).toEqual({
      version: "0022",
      name: "practice_first_class",
      filename: "0022_practice_first_class.sql",
    });
  });

  it("accepts digits inside names", () => {
    expect(parseMigrationFilename("0021_extend_category_check_v2.sql")).toEqual({
      version: "0021",
      name: "extend_category_check_v2",
      filename: "0021_extend_category_check_v2.sql",
    });
  });

  it("rejects non-sql files", () => {
    expect(parseMigrationFilename("README.md")).toBeNull();
    expect(parseMigrationFilename("0001_auth.txt")).toBeNull();
  });

  it("rejects fewer-than-4 version digits", () => {
    expect(parseMigrationFilename("001_auth.sql")).toBeNull();
  });

  it("rejects uppercase or hyphenated names", () => {
    // Hyphens disallowed: enforces snake_case for grep-ability.
    expect(parseMigrationFilename("0001-auth.sql")).toBeNull();
    expect(parseMigrationFilename("0001_Auth.sql")).toBeNull();
  });

  it("rejects missing version prefix", () => {
    expect(parseMigrationFilename("auth.sql")).toBeNull();
  });
});

describe("discoverMigrations", () => {
  function makeTmpDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "migrate-test-"));
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content);
    }
    return dir;
  }

  it("returns matching files in numeric order", () => {
    const dir = makeTmpDir({
      "0003_three.sql": "-- 3",
      "0001_one.sql": "-- 1",
      "0002_two.sql": "-- 2",
    });
    const result = discoverMigrations(dir);
    expect(result.map((m: { version: string }) => m.version)).toEqual(["0001", "0002", "0003"]);
  });

  it("ignores non-migration files in the directory", () => {
    const dir = makeTmpDir({
      "0001_a.sql": "-- a",
      "README.md": "# readme",
      "0001_a.sql.bak": "-- backup",
      ".DS_Store": "",
    });
    const result = discoverMigrations(dir);
    expect(result).toHaveLength(1);
    expect(result[0].version).toBe("0001");
  });

  it("throws on duplicate version prefixes", () => {
    const dir = makeTmpDir({
      "0001_a.sql": "-- a",
      "0001_b.sql": "-- b",
    });
    expect(() => discoverMigrations(dir)).toThrow(/Duplicate migration version 0001/);
  });

  it("returns an empty array for an empty directory", () => {
    const dir = makeTmpDir({});
    expect(discoverMigrations(dir)).toEqual([]);
  });
});

describe("sha256", () => {
  it("is stable for identical input", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
  });

  it("differs for different input", () => {
    expect(sha256("hello")).not.toBe(sha256("world"));
  });

  it("differs for trailing-newline differences", () => {
    // Intentional: cross-platform line-ending drift will show up as a
    // hash mismatch, prompting the developer to commit a normalized form.
    expect(sha256("hello")).not.toBe(sha256("hello\n"));
  });

  it("returns a 64-char hex string", () => {
    const h = sha256("anything");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
