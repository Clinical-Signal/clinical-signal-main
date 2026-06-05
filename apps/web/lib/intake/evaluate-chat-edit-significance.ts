import type { LanguageModel } from "ai";
import { generateText } from "ai";
import { z } from "zod";

import { logSafeError } from "@/lib/log-safe";
import { getBedrockChatModel } from "@/lib/llm/bedrock";
import { parseLlmJson } from "@/lib/llm/parse-llm-json";

import { loadIntakeChatPrompt } from "./load-intake-chat-prompt";

const GATEKEEPER_PROMPT_FILE = "intake_chat_edit_gatekeeper_v1.md";

const GatekeeperSchema = z.object({
  isSignificantChange: z.boolean(),
  reason: z.string().min(1).max(280),
});

export type GatekeeperResult = z.infer<typeof GatekeeperSchema>;

export async function evaluateChatEditSignificance(input: {
  original: string;
  edited: string;
  /** Bedrock model via Vercel AI SDK (defaults to Claude 3 Opus). */
  model?: LanguageModel;
}): Promise<GatekeeperResult> {
  const original = input.original.trim();
  const edited = input.edited.trim();

  if (original === edited) {
    return {
      isSignificantChange: false,
      reason: "No textual change detected.",
    };
  }

  const { text } = await generateText({
    model: input.model ?? getBedrockChatModel(),
    maxOutputTokens: 120,
    temperature: 0,
    system: loadIntakeChatPrompt(GATEKEEPER_PROMPT_FILE),
    prompt: `Original message:\n${original}\n\nEdited message:\n${edited}`,
  });

  try {
    return parseLlmJson(text, GatekeeperSchema);
  } catch (error) {
    logSafeError("[GATEKEEPER_PARSE_ERROR]", error);
    throw new Error(
      error instanceof Error
        ? `Gatekeeper JSON invalid: ${error.message}`
        : "Gatekeeper JSON invalid",
    );
  }
}
