import { generateText } from "ai";
import { z } from "zod";

import { parseLlmJson } from "@/lib/llm/parse-llm-json";
import { getOpenRouterChatModel } from "@/lib/llm/openrouter";

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
    model: getOpenRouterChatModel(),
    maxOutputTokens: 120,
    temperature: 0,
    system: loadIntakeChatPrompt(GATEKEEPER_PROMPT_FILE),
    prompt: `Original message:\n${original}\n\nEdited message:\n${edited}`,
  });

  try {
    return parseLlmJson(text, GatekeeperSchema);
  } catch (error) {
    console.error("[GATEKEEPER_PARSE_ERROR]", error);
    throw new Error(
      error instanceof Error
        ? `Gatekeeper JSON invalid: ${error.message}`
        : "Gatekeeper JSON invalid",
    );
  }
}
