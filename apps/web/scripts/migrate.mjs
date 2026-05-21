#!/usr/bin/env node
// apps/web/scripts/migrate.mjs
//
// Deterministic schema migration runner for Clinical Signal.
//
// Why this exists:
//   - Until Phase 1 / PR1, migrations were applied two different ways:
//       1. database/init/02..06.sql ran on first Postgres bring-up (covering
//          only 0001-0005 of 22 migration files).
//       2. Migrations 0006-0022 were applied "manually" (per the comment in
//          .aptible.yml). That meant a fresh production database could ship
//          with an incomplete schema, and there was no record of which
//          migrations had been applied to which environment.
//   - This script makes migration application deterministic and recorded.
//
// What it does:
//   1. Connects to DATABASE_URL (or MIGRATE_DATABASE_URL if set).
//   2. Ensures the `schema_migrations` table exists (creates it if not).
//   3. Discovers migration files matching ^\d{4}_.*\.sql$ in MIGRATIONS_DIR.
//   4. Refuses to start if duplicate version prefixes exist on disk.
//   5. Refuses to start if a previously-applied migration's SHA-256 has
//      changed (migrations are immutable; create a new file to amend).
//   6. If `schema_migrations` is empty AND clinical schema already exists
//      (the `tenants` table), enters BASELINE MODE: marks every discovered
//      file as applied without running it. This is the safe adoption path
//      for environments where migrations were previously applied via init
//      scripts or manual psql.
//   7. Otherwise applies any unapplied migration files in numeric order,
//      each in its own transaction, recording the hash on success.
//
// Why a separate runner instead of a vendor migration tool:
//   - Repo currently uses pg directly (no Prisma/Drizzle/Knex). Adding a
//     migration framework would expand the dependency surface for one
//     small, well-defined task. ~150 lines of pure Node + pg solves it.
//   - HIPAA-relevant tooling: fewer third-party tools = simpler BAA story.
//
// Why ESM (.mjs) instead of TypeScript:
//   - No compile step needed. Identical execution path in dev (via npm
//     run db:migrate) and on Aptible (via .aptible.yml before_release).
//   - The script's surface is small and well-tested by lib/__tests__/migrate.test.ts.
//
// Environment:
//   DATABASE_URL          Connection string. The migrate user needs DDL
//                         privileges (CREATE TABLE, ALTER TABLE, CREATE
//                         POLICY) and CREATEROLE for migration 0002 which
//                         creates the runtime `app_user` role.
//   MIGRATE_DATABASE_URL  Optional override. When set, takes precedence
//                         over DATABASE_URL. Useful when the runtime app
//                         user lacks DDL/CREATEROLE.
//   MIGRATIONS_DIR        Optional. Defaults to ../../../database/migrations
//                         relative to this file (works in dev). In the
//                         production image, set to /app/database/migrations.

import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default location when running from the repo (apps/web/scripts/migrate.mjs)
// → ../../database/migrations. The production Dockerfile copies migrations
// to /app/database/migrations and sets MIGRATIONS_DIR explicitly.
const DEFAULT_MIGRATIONS_DIR = resolve(__dirname, "..", "..", "..", "database", "migrations");

// Filenames must match this exactly: 4-digit version, underscore, lowercase
// snake-case name, .sql extension. Anything else in the directory is
// ignored (e.g. README.md, fix scripts staged but not yet applied).
const FILENAME_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

// Tables whose presence indicates the clinical schema has already been
// applied to this database (used by the baseline-mode heuristic). `tenants`
// is the load-bearing table — it exists from migration 0001 and is required
// by every subsequent migration. If it exists but schema_migrations doesn't,
// migrations were applied by some path other than this runner.
const BASELINE_PROBE_TABLE = "tenants";

/**
 * Parses a migration filename. Returns `null` for non-matching files so the
 * caller can filter (rather than throw on every README or .DS_Store).
 *
 * @param {string} filename
 * @returns {{ version: string, name: string, filename: string } | null}
 */
export function parseMigrationFilename(filename) {
  const m = FILENAME_RE.exec(filename);
  if (!m) return null;
  return { version: m[1], name: m[2], filename };
}

/**
 * Lists all migration files in `dir`, sorted by version. Throws if two
 * files share the same version prefix (a strong signal someone duplicated
 * a migration during a merge).
 *
 * @param {string} dir
 * @returns {Array<{ version: string, name: string, filename: string }>}
 */
export function discoverMigrations(dir) {
  const entries = readdirSync(dir);
  const parsed = entries
    .map((f) => parseMigrationFilename(f))
    .filter((m) => m !== null)
    .sort((a, b) => a.version.localeCompare(b.version));

  const seen = new Map();
  for (const m of parsed) {
    const prior = seen.get(m.version);
    if (prior) {
      throw new Error(
        `Duplicate migration version ${m.version}: "${prior}" and "${m.filename}". ` +
          `Migration version prefixes must be unique.`,
      );
    }
    seen.set(m.version, m.filename);
  }
  return parsed;
}

/**
 * SHA-256 hex digest of arbitrary content. Hashing is done on the raw bytes
 * we read from disk so line-ending differences across platforms produce
 * different hashes — that's intentional. Migrations applied on Linux must
 * round-trip identically to what's checked in.
 *
 * @param {string | Buffer} content
 * @returns {string}
 */
export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Creates schema_migrations if it doesn't exist. Identical to the DDL in
 * 0023_schema_migrations_table.sql; we run this first because the runner
 * itself needs the table before it can record having applied 0023.
 *
 * @param {pg.Client} client
 */
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      sha256      TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_by  TEXT NOT NULL DEFAULT current_user
    )
  `);
}

/**
 * @param {pg.Client} client
 * @returns {Promise<Map<string, { version: string, name: string, sha256: string }>>}
 */
async function loadAppliedMigrations(client) {
  const { rows } = await client.query("SELECT version, name, sha256 FROM schema_migrations");
  return new Map(rows.map((r) => [r.version, r]));
}

/**
 * @param {pg.Client} client
 * @param {string} table
 * @returns {Promise<boolean>}
 */
async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = $1 AND c.relkind = 'r' AND n.nspname = 'public'
      LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

/**
 * Applies a single migration file in its own transaction. The migration
 * file is responsible for its own BEGIN/COMMIT if it wants to be a
 * single statement; we wrap the whole file in a transaction so partial
 * application is impossible.
 *
 * Note: pg's `query()` accepts multi-statement SQL when there are no
 * parameter placeholders, which is what we need for migration files.
 *
 * @param {pg.Client} client
 * @param {string} dir
 * @param {{ version: string, name: string, filename: string }} m
 * @returns {Promise<string>} the file's SHA-256, recorded for posterity
 */
async function applyMigration(client, dir, m) {
  const path = join(dir, m.filename);
  const sql = readFileSync(path, "utf8");
  const hash = sha256(sql);

  console.log(`[migrate] applying ${m.filename} (sha256=${hash.slice(0, 12)}...)`);
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (version, name, sha256)
       VALUES ($1, $2, $3)`,
      [m.version, m.name, hash],
    );
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Best-effort rollback; the connection may be in a bad state.
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`migration ${m.filename} failed during apply: ${detail}`);
  }
  return hash;
}

/**
 * Records every discovered migration file as already-applied without
 * executing any of them. Used when this runner is introduced to a database
 * whose schema is already up-to-date via the previous (manual / init)
 * application path. Subsequent runs will see those rows and only apply
 * genuinely new migrations.
 *
 * @param {pg.Client} client
 * @param {string} dir
 * @param {Array<{ version: string, name: string, filename: string }>} discovered
 */
async function baselineExisting(client, dir, discovered) {
  console.log(
    `[migrate] baseline mode: schema_migrations is empty but ${BASELINE_PROBE_TABLE} ` +
      `exists. Recording ${discovered.length} migration(s) as already-applied.`,
  );
  await client.query("BEGIN");
  try {
    for (const m of discovered) {
      const sql = readFileSync(join(dir, m.filename), "utf8");
      const hash = sha256(sql);
      await client.query(
        `INSERT INTO schema_migrations (version, name, sha256)
         VALUES ($1, $2, $3)
         ON CONFLICT (version) DO NOTHING`,
        [m.version, m.name, hash],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Best-effort rollback.
    }
    throw err;
  }
}

/**
 * Main entry point. Returns a stats object so the test suite and CI can
 * make assertions about behavior.
 *
 * @param {{ dir?: string, connectionString?: string }} [opts]
 * @returns {Promise<{ applied: number, skipped: number, baselined: number, total: number }>}
 */
export async function runMigrations(opts = {}) {
  const dir = opts.dir || process.env.MIGRATIONS_DIR || DEFAULT_MIGRATIONS_DIR;
  const connectionString =
    opts.connectionString || process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL (or MIGRATE_DATABASE_URL) must be set for the migration runner.",
    );
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  /** @type {{ applied: number, skipped: number, baselined: number, total: number }} */
  const stats = { applied: 0, skipped: 0, baselined: 0, total: 0 };

  try {
    await ensureMigrationsTable(client);
    const discovered = discoverMigrations(dir);
    stats.total = discovered.length;

    let applied = await loadAppliedMigrations(client);

    // Baseline path: empty migrations table but schema is already populated.
    if (applied.size === 0 && (await tableExists(client, BASELINE_PROBE_TABLE))) {
      await baselineExisting(client, dir, discovered);
      stats.baselined = discovered.length;
      applied = await loadAppliedMigrations(client);
    }

    // Hash-mismatch check: every applied migration's stored hash must match
    // the file currently on disk. This catches "someone edited an old
    // migration to fix a typo" before it silently skips.
    for (const m of discovered) {
      const prev = applied.get(m.version);
      if (!prev) continue;
      const sql = readFileSync(join(dir, m.filename), "utf8");
      const hash = sha256(sql);
      if (prev.sha256 !== hash) {
        throw new Error(
          `Hash mismatch for ${m.filename}: applied=${prev.sha256.slice(0, 12)}... ` +
            `disk=${hash.slice(0, 12)}.... Migrations are immutable. ` +
            `Create a new migration file to amend prior schema.`,
        );
      }
    }

    for (const m of discovered) {
      if (applied.has(m.version)) {
        stats.skipped++;
        continue;
      }
      await applyMigration(client, dir, m);
      stats.applied++;
    }

    return stats;
  } finally {
    await client.end();
  }
}

// CLI entry point. Detect "run as a script" reliably across Node ESM resolution
// quirks (file:// vs absolute path differences on different platforms).
const invokedAsScript =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);

if (invokedAsScript) {
  runMigrations()
    .then((s) => {
      console.log(
        `[migrate] done: applied=${s.applied} skipped=${s.skipped} ` +
          `baselined=${s.baselined} total=${s.total}`,
      );
      process.exit(0);
    })
    .catch((err) => {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[migrate] failed: ${detail}`);
      process.exit(1);
    });
}
