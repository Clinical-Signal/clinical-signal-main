import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Phase 0 BUILD & TEST — intake foundation unit tests only. */
export default defineConfig({
  root: path.join(rootDir, "apps/web"),
  resolve: {
    alias: {
      "@": path.join(rootDir, "apps/web"),
    },
  },
  test: {
    include: [
      "lib/env.test.ts",
      "lib/auth/require-auth.test.ts",
      "lib/intake/schemas/question-plan.schema.test.ts",
      "lib/readiness/readiness.test.ts",
      "lib/intake/friction-budget.test.ts",
      "lib/intake/deterministic-triggers.test.ts",
      "lib/intake/schemas/step-one.schema.test.ts",
      "lib/intake/schemas/intake-data.schema.test.ts",
      "lib/intake/merge-intake.test.ts",
      "lib/tokens/intake-token.test.ts",
      "lib/intake/question-banks.test.ts",
      "lib/intake/question-banks-legacy-prompts.test.ts",
      "lib/llm/analyze-intake.test.ts",
      "lib/llm/synthesize-note.test.ts",
      "lib/llm/clinical-synthesis.schema.test.ts",
    ],
    environment: "node",
  },
});
