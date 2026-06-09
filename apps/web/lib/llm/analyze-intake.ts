import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.mjs";

import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";
import {
  IntakeIssueIdentificationOutput,
  type IntakeIssueIdentificationOutput as IntakeIssueIdentificationOutputType,
} from "@/lib/intake/schemas/question-plan.schema";
import { DEFAULT_MODEL, stripCodeFences } from "@/lib/llm";

export const INTAKE_ISSUE_IDENTIFICATION_PROMPT_FILE =
  "intake_issue_identification_v1.md";

/** Persisted alongside successful analyze results (immutable prompt artifact version). */
export const INTAKE_ISSUE_IDENTIFICATION_PROMPT_VERSION = "v1" as const;

const PROMPTS_DIR = path.join("services", "analysis-engine", "prompts");

const MAX_OUTPUT_TOKENS = 2048;
const MAX_PARSE_ATTEMPTS = 2;

export type AnalyzeIntakeSuccess = {
  output: IntakeIssueIdentificationOutputType;
  modelId: string;
  promptVersion: typeof INTAKE_ISSUE_IDENTIFICATION_PROMPT_VERSION;
};

type TextBlock = { type: "text"; text: string };

export type AnthropicMessageResult = {
  content: TextBlock[];
};

export type CreateMessageFn = (params: {
  model: string;
  max_tokens: number;
  system: Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral" };
  }>;
  messages: MessageParam[];
}) => Promise<AnthropicMessageResult>;

export type AnalyzeIntakeDependencies = {
  loadSystemPrompt?: () => string;
  createMessage?: CreateMessageFn;
  modelId?: string;
};

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

const promptCache = new Map<string, string>();

/** Loads the PHI-free issue-identification system prompt from the analysis-engine prompts directory. */
export function loadIntakeIssueIdentificationPrompt(): string {
  const cached = promptCache.get(INTAKE_ISSUE_IDENTIFICATION_PROMPT_FILE);
  if (cached !== undefined) {
    return cached;
  }
  const text = readFileSync(
    resolvePromptPath(INTAKE_ISSUE_IDENTIFICATION_PROMPT_FILE),
    "utf-8",
  );
  promptCache.set(INTAKE_ISSUE_IDENTIFICATION_PROMPT_FILE, text);
  return text;
}

function extractResponseText(message: AnthropicMessageResult): string {
  let text = "";
  for (const block of message.content) {
    if (block.type === "text") {
      text += block.text;
    }
  }
  return text;
}

function parseModelOutput(raw: string): IntakeIssueIdentificationOutputType {
  const jsonText = stripCodeFences(raw);
  const parsed: unknown = JSON.parse(jsonText);
  return IntakeIssueIdentificationOutput.parse(parsed);
}

async function defaultCreateMessage(
  params: Parameters<CreateMessageFn>[0],
): Promise<AnthropicMessageResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key });
  const message = await client.messages.create(params);
  const content: TextBlock[] = [];
  for (const block of message.content) {
    if (block.type === "text") {
      content.push(block);
    }
  }
  return { content };
}

/**
 * Runs the intake issue-identification LLM call. Returns null after two parse failures,
 * missing configuration, or any runtime error so the caller can use the degraded path.
 */
export async function analyzeIntake(
  intakeData: IntakeData,
  deps: AnalyzeIntakeDependencies = {},
): Promise<AnalyzeIntakeSuccess | null> {
  try {
    const loadPrompt = deps.loadSystemPrompt ?? loadIntakeIssueIdentificationPrompt;
    const systemPrompt = loadPrompt();
    const modelId = deps.modelId ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
    const createMessage = deps.createMessage ?? defaultCreateMessage;
    const userContent = JSON.stringify(intakeData);

    for (let attempt = 0; attempt < MAX_PARSE_ATTEMPTS; attempt++) {
      let message: AnthropicMessageResult;
      try {
        message = await createMessage({
          model: modelId,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: [
            {
              type: "text",
              text: systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: userContent }],
        });
      } catch (error) {
        console.error(
          "[analyzeIntake] Anthropic request failed",
          { attempt: attempt + 1, modelId },
          error,
        );
        return null;
      }

      try {
        const text = extractResponseText(message);
        const output = parseModelOutput(text);
        return {
          output,
          modelId,
          promptVersion: INTAKE_ISSUE_IDENTIFICATION_PROMPT_VERSION,
        };
      } catch (error) {
        console.error(
          "[analyzeIntake] Response parse failed",
          { attempt: attempt + 1 },
          error,
        );
      }
    }

    return null;
  } catch (error) {
    console.error("[analyzeIntake] Unhandled failure — using degraded path", error);
    return null;
  }
}
