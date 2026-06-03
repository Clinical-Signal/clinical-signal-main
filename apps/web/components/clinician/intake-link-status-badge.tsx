import { Badge } from "@/components/ui/badge";
import type { IntakeLinkDisplayStatus } from "@/lib/intake/get-patient-intake-link-status";

const COPY: Record<
  IntakeLinkDisplayStatus,
  { label: string; tone: "warning" | "success" | "neutral" }
> = {
  pending: { label: "Link Active", tone: "warning" },
  completed: { label: "Intake Finished", tone: "success" },
  none: { label: "No Active Link", tone: "neutral" },
};

export type IntakeLinkStatusBadgeProps = {
  status: IntakeLinkDisplayStatus;
};

export function IntakeLinkStatusBadge({ status }: IntakeLinkStatusBadgeProps) {
  const { label, tone } = COPY[status];
  return <Badge tone={tone}>{label}</Badge>;
}
