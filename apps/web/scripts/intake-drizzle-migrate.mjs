#!/usr/bin/env node
/**
 * Apply Phase 1 intake SQL migrations.
 *
 * Brownfield (default): supplemental + RLS only.
 * Greenfield: set INTAKE_MIGRATE_GREENFIELD=1 to also run 0000_phase1_intake.sql.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "drizzle", "migrations");

const greenfield = process.env.INTAKE_MIGRATE_GREENFIELD === "1";
const files = greenfield
  ? [
      "0000_phase1_intake.sql",
      "0001_phase1_supplemental.sql",
      "0002_rls.sql",
    ]
  : [
      "0001_phase1_supplemental.sql",
      "0002_rls.sql",
      "0003_intake_token_rate_limits_and_verify.sql",
      "0004_intake_synthesis_resolved.sql",
      "0005_intake_token_status.sql",
      "0006_intake_chat_messages.sql",
      "0007_intake_chat_branches.sql",
      "0008_patient_contact_email.sql",
    ];

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
