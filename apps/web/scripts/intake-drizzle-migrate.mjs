#!/usr/bin/env node
/**
 * Apply intake Drizzle SQL migrations (0001 schema + 0002 RLS).
 * Uses psql via docker when local psql is unavailable.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "drizzle", "migrations");
const files = ["0001_intake_schema.sql", "0002_rls.sql"];

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://clinical_signal:change_me_dev_only@localhost:5432/clinical_signal";

function runPsqlViaDocker(sql) {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "clinical_signal",
      "-d",
      "clinical_signal",
    ],
    { input: sql, encoding: "utf8", cwd: join(root, "../..") },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  process.stdout.write(result.stdout ?? "");
}

function runPsqlNative(sql) {
  const result = spawnSync("psql", [databaseUrl], { input: sql, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  process.stdout.write(result.stdout ?? "");
}

const hasPsql =
  spawnSync("psql", ["--version"], { encoding: "utf8" }).status === 0;

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  console.log(`[intake-drizzle-migrate] applying ${file}`);
  if (hasPsql) {
    runPsqlNative(sql);
  } else {
    runPsqlViaDocker(sql);
  }
}

console.log("[intake-drizzle-migrate] done");
