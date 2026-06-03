import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.mjs";

import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";
import { DEFAULT_MODEL, stripCodeFences } from "@/lib/llm";

import { buildClinicalSynthesisPayload } from "./build-clinical-synthesis-payload";
import {
  ClinicalSynthesisOutput,
  type ClinicalSynthesisOutput as ClinicalSynthesisOutputType,
} from "./clinical-synthesis.schema";

export const INTAKE_CLINICAL_SYNTHESIS_PROMPT_FILE =
  "intake_clinical_synthesis_v1.md";

/** Persisted alongside successful synthesis results (immutable prompt artifact version). */
export const INTAKE_CLINICAL_SYNTHESIS_PROMPT_VERSION = "v1" as const;

const PROMPT_RELATIVE = path.join(
  "services",
  "analysis-engine",
  "prompts",
  INTAKE_CLINICAL_SYNTHESIS_PROMPT_FILE,
);

const MAX_OUTPUT_TOKENS = 8192;
const MAX_PARSE_ATTEMPTS = 2;

export type SynthesizeNoteSuccess = {
  output: ClinicalSynthesisOutputType;
  modelId: string;
  promptVersion: typeof INTAKE_CLINICAL_SYNTHESIS_PROMPT_VERSION;
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

export type SynthesizeNoteDependencies = {
  loadSystemPrompt?: () => string;
  createMessage?: CreateMessageFn;
  modelId?: string;
};

function resolvePromptPath(): string {
  const candidates = [
    path.join(process.cwd(), PROMPT_RELATIVE),
    path.join(process.cwd(), "..", "..", PROMPT_RELATIVE),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Missing system prompt at ${PROMPT_RELATIVE} (cwd=${process.cwd()})`,
  );
}

let cachedSystemPrompt: string | undefined;

/** Loads the PHI-free system prompt from the analysis-engine prompts directory. */
export function loadIntakeClinicalSynthesisPrompt(): string {
  if (cachedSystemPrompt !== undefined) {
    return cachedSystemPrompt;
  }
  cachedSystemPrompt = readFileSync(resolvePromptPath(), "utf-8");
  return cachedSystemPrompt;
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

function parseModelOutput(raw: string): ClinicalSynthesisOutputType {
  const jsonText = stripCodeFences(raw);
  const parsed: unknown = JSON.parse(jsonText);
  return ClinicalSynthesisOutput.parse(parsed);
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
 * Synthesizes full intake state into a draft clinical note (CC, HPI, ROS) plus
 * suggested next steps. Returns null after two parse failures, missing configuration,
 * or any runtime error.
 */
export async function synthesizeNote(
  intakeData: IntakeData,
  deps: SynthesizeNoteDependencies = {},
): Promise<SynthesizeNoteSuccess | null> {
  try {
    const loadPrompt = deps.loadSystemPrompt ?? loadIntakeClinicalSynthesisPrompt;
    const systemPrompt = loadPrompt();
    const modelId = deps.modelId ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
    const createMessage = deps.createMessage ?? defaultCreateMessage;
    const userContent = JSON.stringify(buildClinicalSynthesisPayload(intakeData));

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
          "[synthesizeNote] Anthropic request failed",
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
          promptVersion: INTAKE_CLINICAL_SYNTHESIS_PROMPT_VERSION,
        };
      } catch (error) {
        console.error(
          "[synthesizeNote] Response parse failed",
          { attempt: attempt + 1 },
          error,
        );
      }
    }

    return null;
  } catch (error) {
    console.error("[synthesizeNote] Unhandled failure", error);
    return null;
  }
}
