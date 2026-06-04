import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PROMPTS_DIR = path.join("services", "analysis-engine", "prompts");

function resolvePromptPath(fileName: string): string {
  const relative = path.join(PROMPTS_DIR, fileName);
  const candidates = [
    path.join(process.cwd(), relative),
    path.join(process.cwd(), "..", "..", relative),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Missing system prompt at ${relative} (cwd=${process.cwd()})`);
}

const cache = new Map<string, string>();

export function loadIntakeChatPrompt(fileName: string): string {
  const cached = cache.get(fileName);
  if (cached !== undefined) {
    return cached;
  }
  const text = readFileSync(resolvePromptPath(fileName), "utf-8");
  cache.set(fileName, text);
  return text;
}
