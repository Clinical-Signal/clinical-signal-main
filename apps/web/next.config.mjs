import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Point Next's file-trace root at the repo root so the bundler picks up
// `../../packages/{core,db}/src/**` (resolved via tsconfig paths) instead
// of warning about "files outside the project root". Without this the
// standalone output silently drops the imported package source.
const REPO_ROOT = path.resolve(__dirname, "../..");
const APPS_WEB_NODE_MODULES = path.join(__dirname, "node_modules");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output produces a self-contained build that runs with
  // `node .next/standalone/server.js`. Required for container / non-Vercel
  // hosts (e.g., the docker-compose stack locally, the planned AWS ECS
  // task definition).
  output: "standalone",
  experimental: {
    // Server Actions default to a 1MB body limit; lab PDFs can reach the
    // 50MB enforced in lib/records.ts.
    serverActions: {
      bodySizeLimit: "55mb",
    },
    // lib/llm.ts loads prompts at runtime via fs.readFileSync. The Next
    // standalone bundler only traces statically-imported files, so we have
    // to opt the prompts directory in explicitly.
    outputFileTracingIncludes: {
      "*": ["./lib/prompts/**/*.md"],
    },
    // Next 14: outputFileTracingRoot is experimental. Anchors the trace
    // graph at the repo root so `packages/{core,db}/src/**` (imported via
    // tsconfig paths) is included in the standalone output.
    outputFileTracingRoot: REPO_ROOT,
  },
  // The internal TS packages (@cs/core, @cs/db) live at /packages without
  // their own node_modules. Webpack's per-file module resolution would
  // walk upward from packages/db/src/ and never find `pg`, which lives in
  // apps/web/node_modules. Add it to resolve.modules so any file in the
  // build graph — wherever it lives on disk — can find runtime deps that
  // are installed at the apps/web layer.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    const existingModules = Array.isArray(config.resolve.modules)
      ? config.resolve.modules
      : ["node_modules"];
    config.resolve.modules = [
      ...existingModules,
      APPS_WEB_NODE_MODULES,
    ];
    return config;
  },
};

export default nextConfig;
