/**
 * Centralized Claude client + prompt loader.
 *
 * Every Anthropic SDK call in apps/web/ goes through this file. New AI
 * features add a prompt to lib/prompts/ and call callModel() or streamModel()
 * from here — no other file should import @anthropic-ai/sdk directly.
 *
 * Mirrors the convention on the Python side at
 * services/analysis-engine/app/pipeline/llm.py +
 * services/analysis-engine/prompts/*.md.
 */
import { promises as fsp, readFileSync } from "node:fs";
import path from "node:path";

import type AnthropicSdk from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Message,
  StopReason,
} from "@anthropic-ai/sdk/resources/messages.mjs";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default model used when a caller does not specify one. */
export const DEFAULT_MODEL: string =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

/** Default request timeout (ms). Long-running protocol generation overrides. */
const DEFAULT_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// SDK client (dynamic import preserves the previous pattern: the module does
// not crash if @anthropic-ai/sdk happens to be missing at boot time).
// ---------------------------------------------------------------------------

type AnthropicClient = InstanceType<typeof AnthropicSdk>;

async function createClient(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<AnthropicClient> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: key, timeout: timeoutMs });
}

// ---------------------------------------------------------------------------
// Prompt loading
//
// Prompts live as plain .md files in lib/prompts/ and are read at runtime so
// they can be edited without touching TypeScript. Reads are cached in-process.
//
// next.config.mjs uses outputFileTracingIncludes to bundle the prompts dir
// into the Next standalone build.
// ---------------------------------------------------------------------------

const PROMPTS_DIR = path.join(process.cwd(), "lib", "prompts");

const _promptCache = new Map<string, string>();
const _hashCache = new Map<string, string>();

function promptPath(name: string): string {
  if (!/^[a-z0-9_]+$/i.test(name)) {
    throw new Error(`Invalid prompt name: ${name}`);
  }
  return path.join(PROMPTS_DIR, `${name}.md`);
}

/**
 * Load a prompt by name (e.g. "clinical_analysis_v1"). Reads from
 * lib/prompts/{name}.md, caches in-process, throws if the file is missing.
 */
export function loadPrompt(name: string): string {
  const cached = _promptCache.get(name);
  if (cached !== undefined) return cached;
  const content = readFileSync(promptPath(name), "utf-8");
  _promptCache.set(name, content);
  return content;
}

/** Async variant for callers that prefer non-blocking I/O. */
export async function loadPromptAsync(name: string): Promise<string> {
  const cached = _promptCache.get(name);
  if (cached !== undefined) return cached;
  const content = await fsp.readFile(promptPath(name), "utf-8");
  _promptCache.set(name, content);
  return content;
}

/**
 * Short content hash for prompt-version telemetry. Stored in protocol /
 * analysis metadata so output quality can be correlated with specific prompt
 * revisions across deployments. Not for security — just change detection.
 */
export function promptHash(name: string): string {
  const cached = _hashCache.get(name);
  if (cached !== undefined) return cached;
  const content = loadPrompt(name);
  // DJB2 — fast, deterministic, no crypto dependency. Matches the prior
  // implementation in lib/analysis.ts so existing telemetry stays comparable.
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) & 0xffffffff;
  }
  const hex = (hash >>> 0).toString(36);
  _hashCache.set(name, hex);
  return hex;
}

// ---------------------------------------------------------------------------
// JSON-from-LLM helpers
// ---------------------------------------------------------------------------

/** Strip a leading/trailing markdown code fence, if present. */
export function stripCodeFences(s: string): string {
  s = s.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z0-9]*\n/, "");
    s = s.replace(/\n```\s*$/, "");
  }
  return s;
}

/**
 * Best-effort close of a truncated JSON document so JSON.parse() succeeds.
 * Used when a streamed response hits max_tokens partway through emission —
 * we'd rather return a partially-populated protocol than a hard parse error.
 */
export function salvageJson(raw: string): string {
  let s = stripCodeFences(raw).trim();
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;
  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braces++;
    if (ch === "}") braces--;
    if (ch === "[") brackets++;
    if (ch === "]") brackets--;
  }
  if (inString) s += '"';
  while (brackets > 0) { s += "]"; brackets--; }
  while (braces > 0) { s += "}"; braces--; }
  return s;
}

// ---------------------------------------------------------------------------
// callModel — non-streaming request/response
// ---------------------------------------------------------------------------

export interface CallModelOptions {
  /** System prompt text — typically loadPrompt("name_v1"). */
  system: string;
  /** User/assistant turn(s). */
  messages: MessageParam[];
  /** Model id; defaults to DEFAULT_MODEL. */
  model?: string;
  /** Required — keep cost predictable. */
  maxTokens: number;
  /** Override per-request timeout. */
  timeoutMs?: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CallModelResult {
  /** Concatenated text from every text block in the response. */
  text: string;
  usage: ModelUsage;
  modelId: string;
  stopReason: StopReason | null;
  /** The full SDK Message object for callers that need richer access. */
  message: Message;
}

/** Single, blocking Claude call. Use streamModel() when you need progress events. */
export async function callModel(opts: CallModelOptions): Promise<CallModelResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const claude = await createClient(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const message = await claude.messages.create({
    model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: opts.messages,
  });

  let text = "";
  for (const block of message.content) {
    if (block.type === "text") text += block.text;
  }

  return {
    text,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
    modelId: model,
    stopReason: message.stop_reason,
    message,
  };
}

// ---------------------------------------------------------------------------
// streamModel — token-streaming variant
// ---------------------------------------------------------------------------

export interface StreamModelOptions extends CallModelOptions {
  /**
   * Called for every text delta. Used by the analysis pipeline to ping the
   * Vercel (or container host) request keep-alive while a long generation
   * is in flight.
   */
  onProgress?: () => void;
  /**
   * If true, when the response is truncated by max_tokens we attempt to
   * close any open JSON braces/brackets so the caller can still JSON.parse()
   * the partial output. Set this on JSON-only outputs.
   */
  salvageOnTruncate?: boolean;
}

export interface StreamModelResult extends CallModelResult {
  /** True when the stream stopped because max_tokens was hit. */
  truncated: boolean;
  /**
   * Same as `text` unless salvageOnTruncate was set AND the response was
   * truncated, in which case this is the salvaged (parseable) JSON.
   */
  rawText: string;
}

/**
 * Streaming Claude call. Preserves the previous behavior of the analysis +
 * protocol pipelines: collect text deltas, call onProgress, finalize for
 * usage/stop-reason, optionally salvage a truncated JSON tail.
 */
export async function streamModel(opts: StreamModelOptions): Promise<StreamModelResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const claude = await createClient(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const stream = claude.messages.stream({
    model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: opts.messages,
  });

  let text = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      "delta" in event &&
      "text" in event.delta
    ) {
      text += event.delta.text;
      opts.onProgress?.();
    }
  }

  const message = await stream.finalMessage();
  const truncated = message.stop_reason === "max_tokens";
  const rawText = truncated && opts.salvageOnTruncate ? salvageJson(text) : text;

  return {
    text,
    rawText,
    truncated,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
    modelId: model,
    stopReason: message.stop_reason,
    message,
  };
}

// Re-export the SDK's MessageParam type so callers don't need to add a
// second import path just to type their messages array.
export type { MessageParam };
