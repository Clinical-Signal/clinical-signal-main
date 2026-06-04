import { z } from "zod";

/** Strip markdown code fences and isolate the first JSON object in an LLM reply. */
export function stripMarkdownJsonFences(raw: string): string {
  return raw
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
}

export function extractJsonObjectString(raw: string): string {
  const cleaned = stripMarkdownJsonFences(raw);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("LLM response did not contain a JSON object");
  }
  return cleaned.slice(start, end + 1);
}

export function parseLlmJson<T extends z.ZodTypeAny>(
  raw: string,
  schema: T,
): z.infer<T> {
  const jsonText = extractJsonObjectString(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      `LLM JSON.parse failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }
  return schema.parse(parsed);
}
