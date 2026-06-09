import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PROMPT_FILE = "intake_step_two_chat_v1.md";
const PROMPTS_DIR = path.join("services", "analysis-engine", "prompts");

function resolvePromptPath(): string {
  const relative = path.join(PROMPTS_DIR, PROMPT_FILE);
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

export function loadStepTwoChatSystemPrompt(): string {
  const cached = cache.get(PROMPT_FILE);
  if (cached !== undefined) {
    return cached;
  }
  const text = readFileSync(resolvePromptPath(), "utf-8");
  cache.set(PROMPT_FILE, text);
  return text;
}
