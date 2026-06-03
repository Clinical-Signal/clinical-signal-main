import { Badge } from "@/components/ui/badge";
import type {
  SuggestedNextStep,
  SuggestedNextStepCategory,
  SuggestedNextStepPriority,
} from "@/lib/llm/clinical-synthesis.schema";

const CATEGORY_LABELS: Record<SuggestedNextStepCategory, string> = {
  labs: "Labs",
  lifestyle: "Lifestyle",
  referral: "Referral",
  follow_up: "Follow-up",
  documentation: "Documentation",
  other: "Other",
};

const PRIORITY_TONE: Record<
  SuggestedNextStepPriority,
  "danger" | "warning" | "neutral"
> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

type SuggestedStepsListProps = {
  steps: SuggestedNextStep[];
};

export function SuggestedStepsList({ steps }: SuggestedStepsListProps) {
  return (
    <ul className="flex flex-col gap-3">
      {steps.map((step) => (
        <li
          key={step.id}
          className="rounded-md border border-line bg-surface-sunken px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink">{step.label}</p>
            <Badge tone={PRIORITY_TONE[step.priority]} className="capitalize">
              {step.priority}
            </Badge>
            <Badge tone="accent">{CATEGORY_LABELS[step.category]}</Badge>
          </div>
          <p className="mt-2 text-sm text-ink-muted">{step.rationale}</p>
        </li>
      ))}
    </ul>
  );
}
