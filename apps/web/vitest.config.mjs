// Vitest config without an `import { defineConfig } from "vitest/config"`
// dependency — CI runs vitest via `npx vitest run` and does not install
// it into apps/web/node_modules, so importing vitest's typed helper
// would fail with MODULE_NOT_FOUND. Vitest accepts a plain object.
//
// Mirror the @-aliases from apps/web/tsconfig.json compilerOptions.paths
// so tests that exercise lib/* (which imports from @cs/core / @cs/db)
// resolve at test time the same way the Next build resolves them.

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  test: {
    environment: "node",
    include: [
      "lib/__tests__/**/*.test.ts",
      "lib/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    exclude: ["lib/__tests__/migrate.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@cs/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@cs/db": path.resolve(__dirname, "../../packages/db/src/index.ts"),
    },
  },
};
