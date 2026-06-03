#!/usr/bin/env node
/**
 * C-LOC gate — fails if any tracked source file exceeds 500 lines.
 * Honors patterns in .loc-ignore (gitignore-style).
 *
 * Usage: node scripts/loc-check.mjs
 * Exit 0: all files within limit
 * Exit 1: one or more violations
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_LINES = 500;
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const IGNORE_FILE = join(ROOT, ".loc-ignore");

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".py",
]);

/** @returns {string[]} */
function readIgnorePatterns() {
  if (!existsSync(IGNORE_FILE)) {
    return [];
  }

  return readFileSync(IGNORE_FILE, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * Minimal gitignore-style matcher (supports *, **, and trailing /).
 * @param {string} relativePath - forward-slash normalized path relative to ROOT
 * @param {string} pattern
 */
function matchesPattern(relativePath, pattern) {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const normalizedPath = relativePath.replace(/\\/g, "/");

  if (normalizedPattern.endsWith("/")) {
    const prefix = normalizedPattern.slice(0, -1);
    return (
      normalizedPath === prefix ||
      normalizedPath.startsWith(`${prefix}/`) ||
      normalizedPath.split("/").includes(prefix)
    );
  }

  if (normalizedPattern.includes("**")) {
    const regex = new RegExp(
      `^${normalizedPattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*")}$`,
    );
    return regex.test(normalizedPath);
  }

  if (normalizedPattern.includes("*")) {
    const regex = new RegExp(
      `^${normalizedPattern.replace(/\./g, "\\.").replace(/\*/g, "[^/]*")}$`,
    );
    return regex.test(normalizedPath);
  }

  return (
    normalizedPath === normalizedPattern ||
    normalizedPath.endsWith(`/${normalizedPattern}`) ||
    normalizedPath.split("/").includes(normalizedPattern)
  );
}

/** @param {string} relativePath @param {string[]} patterns */
function isIgnored(relativePath, patterns) {
  return patterns.some((pattern) => matchesPattern(relativePath, pattern));
}

/** @param {string} dir @param {string[]} patterns @param {string[]} files */
function walk(dir, patterns, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    const absolutePath = join(dir, entry.name);
    const relativePath = relative(ROOT, absolutePath);

    if (isIgnored(relativePath, patterns)) {
      continue;
    }

    if (entry.isDirectory()) {
      walk(absolutePath, patterns, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = relativePath.slice(relativePath.lastIndexOf("."));
    if (!SOURCE_EXTENSIONS.has(ext)) {
      continue;
    }

    files.push(absolutePath);
  }
}

/** @param {string} filePath */
function countLines(filePath) {
  const content = readFileSync(filePath, "utf8");
  if (content.length === 0) {
    return 0;
  }
  return content.split("\n").length;
}

const ignorePatterns = readIgnorePatterns();
const allFiles = [];
walk(ROOT, ignorePatterns, allFiles);

/** @type {{ path: string; lines: number }[]} */
const violations = [];

for (const filePath of allFiles) {
  const lines = countLines(filePath);
  if (lines > MAX_LINES) {
    violations.push({
      path: relative(ROOT, filePath).split(sep).join("/"),
      lines,
    });
  }
}

if (violations.length > 0) {
  console.error(`C-LOC: ${violations.length} file(s) exceed ${MAX_LINES} lines:\n`);
  for (const { path, lines } of violations.sort((a, b) => b.lines - a.lines)) {
    console.error(`  ${path}: ${lines} lines`);
  }
  process.exit(1);
}

console.log(
  `C-LOC: all ${allFiles.length} checked file(s) are within the ${MAX_LINES}-line limit.`,
);
process.exit(0);
