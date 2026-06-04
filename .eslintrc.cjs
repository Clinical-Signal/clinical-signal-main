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
  ignorePatterns: [
    "node_modules/",
    "dist/",
    ".next/",
    "coverage/",
    "pnpm-lock.yaml",
  ],
  overrides: [
    {
      files: [
        "apps/web/lib/env.ts",
        "apps/web/lib/auth/**/*.{ts,tsx}",
        "apps/web/lib/audit/**/*.{ts,tsx}",
        "apps/web/app/intake/**/*.{ts,tsx,css}",
      ],
      excludedFiles: ["**/apps/web/styles/tokens.css"],
      rules: {
        "c-tokens/no-raw-color-literal": "error",
      },
    },
    {
      files: ["apps/web/app/intake/**/*.{ts,tsx}"],
      env: { browser: true },
      parserOptions: { ecmaFeatures: { jsx: true } },
      rules: {
        "no-undef": "off",
        "no-unused-vars": "off",
      },
    },
  ],
};
