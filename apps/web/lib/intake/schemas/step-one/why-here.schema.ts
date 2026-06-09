import { z } from "zod";

const rating = z.number().int().min(1).max(10).nullable();

export const WhyHereSchema = z.object({
  what_brings_you: z.string().min(3).max(2000),
  top_three_goals: z.string().max(2000).default(""),
  six_month_vision: z.string().max(2000).default(""),
  overall_health_rating: rating.default(null),
  health_rating_why: z.string().max(2000).default(""),
  motivation_level: rating.default(null),
  motivation_blocker: z.string().max(2000).default(""),
  cost_of_not_changing: z.string().max(2000).default(""),
  health_impact_on_life: z.string().max(2000).default(""),
  what_hasnt_worked: z.string().max(2000).default(""),
  biggest_roadblock: z.string().max(2000).default(""),
  capacity_for_change: z.string().max(2000).default(""),
});

export type WhyHere = z.infer<typeof WhyHereSchema>;

export function createEmptyWhyHere(): WhyHere {
  return {
    what_brings_you: "",
    top_three_goals: "",
    six_month_vision: "",
    overall_health_rating: null,
    health_rating_why: "",
    motivation_level: null,
    motivation_blocker: "",
    cost_of_not_changing: "",
    health_impact_on_life: "",
    what_hasnt_worked: "",
    biggest_roadblock: "",
    capacity_for_change: "",
  };
}
