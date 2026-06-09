#!/usr/bin/env node
// CI gate that fails if:
//   1. Any apps/web/**/*.ts(x) or packages/**/*.ts file imports from "pg"
//      directly. All database access must go through @cs/db.
//   2. Any file imports `withSystem` from outside the small allow-list of
//      auth-spanning modules (sessions, practitioners, password reset,
//      audit log writes, audit log viewer reads).
//
// The gate is intentionally conservative — adding a new system-access
// call site requires editing the allow-list AND writing down the reason,
// which forces reviewer attention every time the no-RLS escape hatch is
// extended.
//
// Run from repo root or from apps/web/. Path normalization is anchored to
// each scan root so the gate produces the same labels whether it runs
// locally, in CI, or inside the dev Docker container (where `apps/web`
// maps to `/app`).
//
// Run: `node apps/web/scripts/check-system-access.mjs`
// CI:  wired into `npm run check:system-access` (apps/web/package.json).

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPS_WEB = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(APPS_WEB, "../..");

// Each scan target maps a normalized prefix (used in the allow-list) to
// an absolute directory the script walks. The container path resolution
// "just works" because we anchor each file path to one of these.
const SCAN_TARGETS = [
  { prefix: "apps/web", root: APPS_WEB },
  { prefix: "packages", root: path.join(REPO_ROOT, "packages") },
];

// Files that ARE allowed to import `withSystem`. Extending this list
// requires reviewer sign-off — every entry is a documented exception
// to the tenant-RLS rule.
const WITH_SYSTEM_ALLOWLIST = new Set([
  "apps/web/lib/db.ts",
  "apps/web/lib/audit.ts",
  "apps/web/lib/auth.ts",
  "apps/web/lib/session.ts",
  "apps/web/app/(auth)/reset-password/actions.ts",
  "apps/web/app/api/audit-logs/route.ts",
  "packages/db/src/index.ts",
  "packages/db/src/withSystem.ts",
]);

// Files allowed to import directly from "pg". The migration runner
// genuinely needs raw pg (it runs outside the Next runtime).
const PG_IMPORT_ALLOWLIST = new Set([
  "apps/web/scripts/migrate.mjs",
  "packages/db/src/client.ts",
  "packages/db/src/index.ts",
  "packages/db/src/withTenantContext.ts",
  "packages/db/src/withSystem.ts",
]);

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  "__tests__",
  "dist",
  "build",
]);

const FILE_EXTS = new Set([".ts", ".tsx", ".mjs"]);

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIR_NAMES.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile() && FILE_EXTS.has(path.extname(e.name))) {
      yield full;
    }
  }
}

const PG_IMPORT_RE = /(?:^|\n)\s*import[^;]*?from\s+["']pg["']/;
const WITH_SYSTEM_IMPORT_RE = /import\s*\{[^}]*\bwithSystem\b[^}]*\}\s*from\s+["'][^"']+["']/;

async function main() {
  const violations = [];

  for (const { prefix, root } of SCAN_TARGETS) {
    for await (const file of walk(root)) {
      const rel = path.posix.join(prefix, path.relative(root, file).split(path.sep).join("/"));
      const src = await fs.readFile(file, "utf8");

      if (PG_IMPORT_RE.test(src) && !PG_IMPORT_ALLOWLIST.has(rel)) {
        violations.push({
          file: rel,
          rule: "no-direct-pg-import",
          message:
            'Imports "pg" directly. Use @cs/db (pool / withTenantContext / withSystem) instead.',
        });
      }

      if (WITH_SYSTEM_IMPORT_RE.test(src) && !WITH_SYSTEM_ALLOWLIST.has(rel)) {
        violations.push({
          file: rel,
          rule: "no-unauthorized-withSystem",
          message:
            "Imports `withSystem` outside the auth-spanning allow-list. " +
            "PHI access must go through `withTenantContext`. If you " +
            "genuinely need to cross the tenant boundary, edit " +
            "apps/web/scripts/check-system-access.mjs and document why.",
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log(
      "[check-system-access] ok — no direct pg imports, no unauthorized withSystem",
    );
    return;
  }

  console.error("[check-system-access] FAILED with the following violations:\n");
  for (const v of violations) {
    console.error(`  ${v.rule}\n    ${v.file}\n    ${v.message}\n`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("[check-system-access] crashed:", err);
  process.exit(2);
});
