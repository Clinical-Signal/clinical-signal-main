import { z } from "zod";

export const WearablesShareSchema = z.enum(["yes", "no", "maybe", ""]);

export const WearablesSchema = z.object({
  devices: z.array(z.string().max(80)).default([]),
  usage_duration: z.string().max(500).default(""),
  willing_to_share: WearablesShareSchema.default(""),
});

export type Wearables = z.infer<typeof WearablesSchema>;

export function createEmptyWearables(): Wearables {
  return { devices: [], usage_duration: "", willing_to_share: "" };
}
