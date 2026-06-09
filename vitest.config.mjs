import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Phase 0 BUILD & TEST — intake foundation + shared RBAC unit tests. */
export default defineConfig({
  root: rootDir,
  resolve: {
    alias: {
      "@": path.join(rootDir, "apps/web"),
      "@cs/core": path.join(rootDir, "packages/core/src/index.ts"),
      "@cs/db": path.join(rootDir, "packages/db/src/index.ts"),
      "@clinical-signal/shared": path.join(rootDir, "packages/shared/src/index.ts"),
    },
  },
  test: {
    include: [
      "packages/shared/src/**/*.test.ts",
      "apps/web/app/**/actions.test.ts",
      "apps/web/app/**/route.test.ts",
      "apps/web/lib/env.test.ts",
      "apps/web/lib/auth/require-auth.test.ts",
      "apps/web/lib/intake/schemas/question-plan.schema.test.ts",
      "apps/web/lib/readiness/readiness.test.ts",
      "apps/web/lib/intake/friction-budget.test.ts",
      "apps/web/lib/intake/deterministic-triggers.test.ts",
      "apps/web/lib/intake/schemas/step-one.schema.test.ts",
      "apps/web/lib/intake/schemas/intake-data.schema.test.ts",
      "apps/web/lib/intake/merge-intake.test.ts",
      "apps/web/lib/tokens/intake-token.test.ts",
      "apps/web/lib/intake/question-banks.test.ts",
      "apps/web/lib/intake/question-banks-legacy-prompts.test.ts",
      "apps/web/lib/llm/analyze-intake.test.ts",
      "apps/web/lib/llm/synthesize-note.test.ts",
      "apps/web/lib/llm/clinical-synthesis.schema.test.ts",
    ],
    environment: "node",
  },
});
