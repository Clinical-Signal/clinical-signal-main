/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "c-tokens"],
  extends: ["eslint:recommended"],
  overrides: [
    {
      files: [
        "apps/web/lib/intake/**/*.{ts,tsx}",
        "apps/web/lib/readiness/**/*.{ts,tsx}",
        "apps/web/lib/transcription/**/*.{ts,tsx}",
        "apps/web/lib/tokens/**/*.{ts,tsx}",
        "apps/web/lib/llm/**/*.{ts,tsx}",
        "apps/web/lib/env.ts",
        "apps/web/lib/env.test.ts",
        "apps/web/lib/auth/**/*.{ts,tsx}",
        "apps/web/lib/audit/**/*.{ts,tsx}",
        "apps/web/app/intake/**/*.{ts,tsx}",
        "apps/web/styles/**/*.css",
      ],
      excludedFiles: ["**/apps/web/styles/tokens.css"],
      rules: {
        "c-tokens/no-raw-color-literal": "error",
      },
    },
  ],
};
