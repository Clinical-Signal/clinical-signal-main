import { createOpenAI } from "@ai-sdk/openai";

import { env } from "@/lib/env";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenAI-compatible client pointed at OpenRouter.
 * Use `openrouter.chat(modelId)` — the bare `openrouter(modelId)` callable targets
 * OpenAI's Responses API and is not compatible with OpenRouter.
 */
export const openrouter = createOpenAI({
  name: "openrouter",
  baseURL: OPENROUTER_BASE_URL,
  apiKey: env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": env.OPENROUTER_HTTP_REFERER ?? "http://localhost:3000",
    "X-Title": env.OPENROUTER_APP_TITLE ?? "Clinical Signal",
  },
});

export function getOpenRouterModelId(): string {
  return env.OPENROUTER_MODEL;
}

export function getOpenRouterChatModel() {
  return openrouter.chat(getOpenRouterModelId());
}
