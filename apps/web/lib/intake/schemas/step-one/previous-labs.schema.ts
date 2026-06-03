import { z } from "zod";

export const PreviousLabsSchema = z.object({
  has_previous_labs: z.boolean().nullable().default(null),
  remembered_results: z.string().max(2000).default(""),
});

export type PreviousLabs = z.infer<typeof PreviousLabsSchema>;

export function createEmptyPreviousLabs(): PreviousLabs {
  return { has_previous_labs: null, remembered_results: "" };
}
