import { z } from "zod";

export const AnythingElseSchema = z.object({
  additional_info: z.string().max(2000).default(""),
  referral_source: z.string().max(120).default(""),
});

export type AnythingElse = z.infer<typeof AnythingElseSchema>;

export function createEmptyAnythingElse(): AnythingElse {
  return { additional_info: "", referral_source: "" };
}
